// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Core value types for the MCAT scoring layer.
//!
//! These are intentionally decoupled from Anki's `Card`/`RevlogEntry`/`Note`
//! types so the scoring/selection logic can be unit-tested in isolation. An
//! adapter (in the storage/collection layer) is responsible for turning Anki's
//! revlog + FSRS `memory_state` into the [`Review`] / [`RoteMemory`] inputs
//! used here. This mirrors the reference TypeScript engine in
//! `mcat-ui/src/engine`.

/// FSRS answer buttons (Again/Hard/Good/Easy). Matches FSRS `1..=4`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Grade {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

impl Grade {
    pub fn from_button(button: u8) -> Grade {
        match button {
            1 => Grade::Again,
            2 => Grade::Hard,
            4 => Grade::Easy,
            _ => Grade::Good,
        }
    }

    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Broad item category, used to pick latency thresholds and routing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
    Flashcard,
    Discrete,
    Application,
    Cars,
}

/// Per-broad-type latency thresholds (ms). PLACEHOLDER calibration (see PRD).
#[derive(Clone, Copy, Debug)]
pub struct Latency {
    pub fast: u32,
    pub slow: u32,
}

pub fn latency_for(kind: ItemKind) -> Latency {
    match kind {
        ItemKind::Flashcard => Latency {
            fast: 6_000,
            slow: 15_000,
        },
        ItemKind::Discrete => Latency {
            fast: 45_000,
            slow: 90_000,
        },
        ItemKind::Application => Latency {
            fast: 60_000,
            slow: 120_000,
        },
        ItemKind::Cars => Latency {
            fast: 70_000,
            slow: 140_000,
        },
    }
}

/// Per-item expected-time thresholds: the base per-kind latency scaled by the
/// item's parser-scored reasoning complexity (rc) and calculation tedium (ct),
/// both 1..=5 with 3 = typical. A legitimately tedious item gets a larger time
/// budget before "slow" (working-memory reconstruction) is inferred; a trivial
/// one gets a smaller budget. Flashcards are exempt: fast facts must be fast.
pub fn expected_latency(kind: ItemKind, rc: u8, ct: u8) -> Latency {
    let base = latency_for(kind);
    if matches!(kind, ItemKind::Flashcard) {
        return base;
    }
    let scale =
        (1.0 + TEDIUM_LATENCY_STEP * (rc as f32 - 3.0) + TEDIUM_LATENCY_STEP * (ct as f32 - 3.0))
            .clamp(LATENCY_SCALE_MIN, LATENCY_SCALE_MAX);
    Latency {
        fast: (base.fast as f32 * scale).round() as u32,
        slow: (base.slow as f32 * scale).round() as u32,
    }
}

/// One review-log row, projected to just what the scoring layer needs.
#[derive(Clone, Debug)]
pub struct Review {
    pub ts_ms: i64,
    pub grade: Grade,
    pub correct: bool,
    pub ms: u32,
    pub kind: ItemKind,
    pub is_application: bool,
    pub is_cars: bool,
    /// Days since the previous review of the same card.
    pub elapsed_days: f32,
    /// Reviewed too soon to count toward fluency (same-ish day).
    pub massed: bool,
    /// Failed on first exposure -> instruction, not a memory lapse.
    pub productive_failure: bool,
    /// Per-item expected-time thresholds (rc/ct-scaled; see
    /// [`expected_latency`]).
    pub latency: Latency,
}

impl Review {
    /// Continuous spacing weight of this review as fluency evidence: the
    /// spacing effect isn't a same-day cliff, so evidence scales with the gap
    /// since the card was last seen. First-ever exposure counts fully (it is
    /// the baseline attempt, not a massed repeat).
    pub fn spacing_weight(&self) -> f32 {
        if self.elapsed_days <= 0.0 {
            if self.massed {
                0.0
            } else {
                1.0
            }
        } else {
            clamp01(self.elapsed_days / SPACING_FULL_DAYS)
        }
    }
}

/// Current FSRS retrievability of one of a leaf's rote cards.
#[derive(Clone, Copy, Debug)]
pub struct RoteMemory {
    pub retrievability_now: f32,
    pub reps: u32,
}

/// Derived per-subtopic ("leaf") study state. Persisted to SQLite.
#[derive(Clone, Debug, PartialEq)]
pub struct LeafState {
    pub id: String,
    /// 0..1 automaticity + durability of rote recall.
    pub fluency: f32,
    /// 0..1 applied problem-solving skill.
    pub application: f32,
    /// Effective spaced attempts (sum of spacing weights) -> evidence depth.
    pub attempts: f32,
    /// 0..1 recency proxy (FSRS retrievability stand-in).
    pub freshness: f32,
    pub assessed: bool,
    /// fluency gate; always open for CARS.
    pub gate_open: bool,
}

impl LeafState {
    pub fn empty(id: impl Into<String>) -> LeafState {
        LeafState {
            id: id.into(),
            fluency: 0.0,
            application: 0.0,
            attempts: 0.0,
            freshness: 0.0,
            assessed: false,
            gate_open: false,
        }
    }
}

/// Blueprint-weighted readiness on the MCAT 472..528 scale.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Readiness {
    pub pct: f32,
    pub score: i32,
}

/// How much to trust the readiness number.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Confidence {
    pub pct: f32,
    pub coverage: f32,
    pub depth: f32,
    pub freshness: f32,
    /// +/- points on the 472..528 scale.
    pub band: i32,
}

/// Session pacing/selection configuration.
#[derive(Clone, Copy, Debug)]
pub struct StudyConfig {
    pub new_per_day: u32,
    pub max_reviews: u32,
    pub request_retention: f32,
    pub session_size: u32,
}

impl Default for StudyConfig {
    fn default() -> Self {
        StudyConfig {
            new_per_day: 15,
            max_reviews: 120,
            request_retention: 0.9,
            session_size: 12,
        }
    }
}

// ---- shared calibration constants (see PRD + 2026-07-01 scoring spec) ------
pub const N_TARGET: f32 = 5.0; // spaced recalls for full evidence depth
pub const R_TARGET: f32 = 0.9; // desired retrievability
pub const FLUENCY_THRESHOLD: f32 = 0.75; // fluency gate opens at/above this
pub const RECENCY_TAU_DAYS: f32 = 21.0;
pub const DAY_MS: i64 = 86_400_000;

// expected-time scaling from parser rc/ct markers (1..=5, 3 = typical)
pub const TEDIUM_LATENCY_STEP: f32 = 0.15;
pub const LATENCY_SCALE_MIN: f32 = 0.5;
pub const LATENCY_SCALE_MAX: f32 = 2.0;

// continuous spacing weights
pub const SPACING_FULL_DAYS: f32 = 3.0; // rote gap for full evidence weight
pub const APP_SPACING_FULL_DAYS: f32 = 1.0; // leaf-level application gap ditto
pub const APP_SPACING_FLOOR: f32 = 0.3; // same-day fresh problems still count some
pub const SPACED_CORRECT_TARGET: f32 = 2.0; // effective spaced-correct to open gate

// application-implies-fluency (PRD bidirectional inference)
pub const APP_FLUENCY_FLOOR: f32 = 0.8; // any correct application implies at least this fluency

// stale-leaf recalibration (scheduler)
pub const STALE_FRESHNESS: f32 = 0.6; // below this, probe the leaf again
pub const STALE_APP_BOOST: f32 = 1.5; // max priority boost when fully stale

// application scheduling (scheduler)
pub const APP_NEED_BOOST: f32 = 1.5; // max priority boost for weak-application leaves
pub const APP_RESERVE_FRAC: f32 = 1.0 / 3.0; // session share reserved for application MCQs

// shrinkage readiness + variance-propagated confidence
pub const PRIOR_MASTERY: f32 = 0.1; // no-evidence prior mastery
pub const SIGMA_MAX: f32 = 0.5; // per-leaf sd at zero evidence
pub const LEAF_CORRELATION: f32 = 0.3; // cross-leaf ability correlation
pub const SCALE_POINTS: f32 = 56.0; // width of the 472..528 scale

pub fn clamp01(x: f32) -> f32 {
    x.clamp(0.0, 1.0)
}
