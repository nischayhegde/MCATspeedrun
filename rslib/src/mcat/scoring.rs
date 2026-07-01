// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Pure scoring math: auto-grade mapping, mastery, blueprint-weighted readiness
//! and the v1 confidence heuristic. Ported from `mcat-ui/src/lib/scoring.ts`.

use std::collections::HashMap;

use super::model::*;
use super::taxonomy::leaves;
use super::taxonomy::Leaf;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GradeResult {
    pub grade: Grade,
    pub fast: bool,
    pub slow: bool,
    pub correct: bool,
}

/// Auto-grade an objective (MCQ) item from correctness + response time.
///
/// `t` is the item's expected-time thresholds — pass [`expected_latency`] so a
/// legitimately tedious item (high rc/ct) gets a larger time budget before
/// "slow" is inferred, and a trivial one a smaller budget.
pub fn grade_mcq(correct: bool, ms: u32, t: Latency) -> GradeResult {
    if !correct {
        return GradeResult {
            grade: Grade::Again,
            fast: false,
            slow: ms >= t.slow,
            correct: false,
        };
    }
    if ms <= t.fast {
        return GradeResult {
            grade: Grade::Easy,
            fast: true,
            slow: false,
            correct: true,
        };
    }
    if ms >= t.slow {
        return GradeResult {
            grade: Grade::Hard,
            fast: false,
            slow: true,
            correct: true,
        };
    }
    GradeResult {
        grade: Grade::Good,
        fast: false,
        slow: false,
        correct: true,
    }
}

/// Mastery m_i in [0,1]. Application-weighted; CARS is application-only.
pub fn mastery(is_cars: bool, s: &LeafState) -> f32 {
    if is_cars {
        clamp01(s.application)
    } else {
        clamp01(0.4 * s.fluency + 0.6 * s.application)
    }
}

/// Effective evidence behind a leaf's estimate: spaced attempts, discounted by
/// freshness so stale evidence counts less.
fn evidence(s: &LeafState) -> f32 {
    (s.attempts * s.freshness).max(0.0)
}

/// Evidence-shrunk mastery: with little evidence the raw estimate (which can't
/// tell a lucky fast guess from real skill) is pulled toward a low neutral
/// prior; with `n >> N_TARGET` it converges to the raw value.
pub fn mastery_adjusted(is_cars: bool, s: &LeafState) -> f32 {
    let n = evidence(s);
    let w = n / (n + N_TARGET);
    clamp01(w * mastery(is_cars, s) + (1.0 - w) * PRIOR_MASTERY)
}

/// Blueprint-weighted readiness across all leaves -> 472..528. Uses the
/// evidence-shrunk mastery so unassessed/thin leaves read as the prior, not as
/// whatever one data point said.
pub fn readiness(states: &HashMap<String, LeafState>) -> Readiness {
    let mut num = 0.0f32;
    let mut den = 0.0f32;
    for leaf in leaves() {
        let m = states
            .get(leaf.id)
            .map(|s| mastery_adjusted(leaf.is_cars, s))
            .unwrap_or(PRIOR_MASTERY);
        num += leaf.weight * m;
        den += leaf.weight;
    }
    let pct = if den > 0.0 { (num / den) * 100.0 } else { 0.0 };
    let score = (472.0 + (pct / 100.0) * (528.0 - 472.0)).round() as i32;
    Readiness { pct, score }
}

/// Confidence from propagated per-leaf uncertainty.
///
/// Each leaf's mastery estimate carries `sigma_i = SIGMA_MAX / sqrt(1 + n_i)`
/// (n = effective evidence). Readiness variance combines an independent term
/// with a fully-correlated term weighted by [`LEAF_CORRELATION`], because a
/// student's ability is correlated across leaves — assuming independence over
/// 34 leaves would shrink the interval ~6x and read far too confident.
/// Coverage/depth/freshness are kept as reported diagnostics.
pub fn confidence(states: &HashMap<String, LeafState>) -> Confidence {
    let mut w_sum = 0.0f32;
    let mut cov = 0.0f32;
    let mut depth = 0.0f32;
    let mut fresh = 0.0f32;
    for leaf in leaves() {
        let s = states.get(leaf.id);
        w_sum += leaf.weight;
        cov += leaf.weight * s.map(|s| if s.assessed { 1.0 } else { 0.0 }).unwrap_or(0.0);
        depth += leaf.weight * s.map(|s| (s.attempts / N_TARGET).min(1.0)).unwrap_or(0.0);
        fresh += leaf.weight
            * s.map(|s| if s.assessed { s.freshness } else { 0.0 })
                .unwrap_or(0.0);
    }
    let coverage = if w_sum > 0.0 { cov / w_sum } else { 0.0 };
    let d = if w_sum > 0.0 { depth / w_sum } else { 0.0 };
    let f = if w_sum > 0.0 { fresh / w_sum } else { 0.0 };

    let sigma = readiness_sigma(states, w_sum);
    let sigma0 = zero_evidence_sigma(w_sum);
    let pct = if sigma0 > 0.0 {
        (100.0 * (1.0 - sigma / sigma0)).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let band = ((1.96 * sigma * SCALE_POINTS).round() as i32).clamp(1, 28);
    Confidence {
        pct,
        coverage,
        depth: d,
        freshness: f,
        band,
    }
}

/// Sd of the readiness estimate (0..1 mastery scale).
fn readiness_sigma(states: &HashMap<String, LeafState>, w_sum: f32) -> f32 {
    if w_sum <= 0.0 {
        return SIGMA_MAX;
    }
    let mut independent = 0.0f32; // sum((wbar_i * sigma_i)^2)
    let mut correlated = 0.0f32; // sum(wbar_i * sigma_i)
    for leaf in leaves() {
        let n = states.get(leaf.id).map(evidence).unwrap_or(0.0);
        let sigma_i = SIGMA_MAX / (1.0 + n).sqrt();
        let ws = (leaf.weight / w_sum) * sigma_i;
        independent += ws * ws;
        correlated += ws;
    }
    ((1.0 - LEAF_CORRELATION) * independent + LEAF_CORRELATION * correlated * correlated).sqrt()
}

/// The sigma a completely unassessed collection reads (n = 0 everywhere);
/// anchors confidence_pct at 0% cold.
fn zero_evidence_sigma(w_sum: f32) -> f32 {
    if w_sum <= 0.0 {
        return SIGMA_MAX;
    }
    let mut independent = 0.0f32;
    for leaf in leaves() {
        let ws = (leaf.weight / w_sum) * SIGMA_MAX;
        independent += ws * ws;
    }
    ((1.0 - LEAF_CORRELATION) * independent + LEAF_CORRELATION * SIGMA_MAX * SIGMA_MAX).sqrt()
}

/// Convenience: pull a leaf definition (for callers that only have scoring in
/// scope).
pub fn leaf_def(id: &str) -> Option<Leaf> {
    super::taxonomy::leaf(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn states_with(f: impl Fn(&Leaf) -> LeafState) -> HashMap<String, LeafState> {
        leaves().iter().map(|l| (l.id.to_string(), f(l))).collect()
    }

    #[test]
    fn grade_mapping() {
        let t = latency_for(ItemKind::Application);
        assert_eq!(grade_mcq(false, 5_000, t).grade, Grade::Again);
        assert_eq!(grade_mcq(true, 1_000, t).grade, Grade::Easy);
        assert_eq!(grade_mcq(true, 999_999, t).grade, Grade::Hard);
        assert_eq!(grade_mcq(true, 80_000, t).grade, Grade::Good);
    }

    #[test]
    fn tedious_item_gets_larger_time_budget() {
        let base = latency_for(ItemKind::Application);
        // rc/ct = 3 (or untagged) reproduces the flat thresholds exactly
        let typical = expected_latency(ItemKind::Application, 3, 3);
        assert_eq!((typical.fast, typical.slow), (base.fast, base.slow));
        // maximally tedious -> wider budget; trivial -> narrower; both clamped
        let hard = expected_latency(ItemKind::Application, 5, 5);
        let easy = expected_latency(ItemKind::Application, 1, 1);
        assert_eq!(hard.slow, (base.slow as f32 * 1.6) as u32);
        assert_eq!(easy.slow, (base.slow as f32 * 0.5) as u32); // clamped at 0.5
                                                                // flashcards are exempt: fast facts must be fast
        let fc = expected_latency(ItemKind::Flashcard, 5, 5);
        let fc_base = latency_for(ItemKind::Flashcard);
        assert_eq!((fc.fast, fc.slow), (fc_base.fast, fc_base.slow));
        // the same 100s answer reads Hard on a trivial item, Good on a tedious one
        assert_eq!(grade_mcq(true, 100_000, easy).grade, Grade::Hard);
        assert_eq!(grade_mcq(true, 100_000, hard).grade, Grade::Good);
    }

    #[test]
    fn mastery_cars_uses_application_only() {
        let mut s = LeafState::empty("CARS1");
        s.fluency = 1.0;
        s.application = 0.5;
        assert!((mastery(true, &s) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn mastery_cc_blends_fluency_and_application() {
        let mut s = LeafState::empty("1A");
        s.fluency = 1.0;
        s.application = 0.0;
        assert!((mastery(false, &s) - 0.4).abs() < 1e-6);
    }

    #[test]
    fn readiness_bounds() {
        // no evidence -> every leaf sits at the prior, not the scale floor
        let zero = readiness(&states_with(|l| LeafState::empty(l.id)));
        let prior_score = (472.0 + PRIOR_MASTERY * 56.0).round() as i32;
        assert_eq!(zero.score, prior_score);
        // perfect scores with overwhelming evidence -> converges to 528
        let full = readiness(&states_with(|l| {
            let mut s = LeafState::empty(l.id);
            s.fluency = 1.0;
            s.application = 1.0;
            s.attempts = 1000.0;
            s.freshness = 1.0;
            s
        }));
        assert_eq!(full.score, 528);
    }

    #[test]
    fn thin_evidence_shrinks_toward_prior() {
        // one lucky fast attempt must not read as mastered
        let mut s = LeafState::empty("1A");
        s.fluency = 1.0;
        s.application = 1.0;
        s.attempts = 1.0;
        s.freshness = 1.0;
        let thin = mastery_adjusted(false, &s);
        assert!(thin < 0.3, "thin evidence read {thin}");
        s.attempts = 50.0;
        let deep = mastery_adjusted(false, &s);
        assert!(deep > 0.85, "deep evidence read {deep}");
        assert!(deep > thin);
    }

    #[test]
    fn confidence_increases_with_evidence() {
        let states_at = |n: f32| {
            states_with(|l| {
                let mut s = LeafState::empty(l.id);
                s.assessed = true;
                s.attempts = n;
                s.freshness = 1.0;
                s
            })
        };
        let cold = confidence(&states_with(|l| LeafState::empty(l.id)));
        let low = confidence(&states_at(1.0));
        let high = confidence(&states_at(10.0));
        // zero evidence anchors at 0% with a wide honest band
        assert_eq!(cold.pct, 0.0);
        assert!(cold.band >= 20, "cold band was ±{}", cold.band);
        // confidence rises and the band tightens monotonically with evidence
        assert!(low.pct > cold.pct);
        assert!(high.pct > low.pct);
        assert!(low.band <= cold.band);
        assert!(high.band < low.band);
        assert!(high.band >= 1);
    }
}
