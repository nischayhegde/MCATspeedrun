// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Pure scoring math: auto-grade mapping, mastery, blueprint-weighted readiness
//! and the v1 confidence heuristic. Ported from `mcat-ui/src/lib/scoring.ts`.

use std::collections::HashMap;

use super::model::*;
use super::taxonomy;
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

/// Sibling-pooled shrinkage prior: what this leaf's foundational-concept
/// siblings' evidence suggests, blended with the global prior. With no
/// sibling evidence this is exactly [`PRIOR_MASTERY`]; with strong siblings a
/// thin leaf reads like its concept-mates instead of like an unknown.
fn pooled_prior(leaf: &Leaf, states: &HashMap<String, LeafState>) -> f32 {
    let mut n_sum = 0.0f32;
    let mut m_sum = 0.0f32;
    for sib in leaves() {
        if sib.fc != leaf.fc || sib.id == leaf.id {
            continue;
        }
        if let Some(s) = states.get(sib.id) {
            let n = evidence(s);
            n_sum += n;
            m_sum += n * mastery(sib.is_cars, s);
        }
    }
    (m_sum + FC_PRIOR_PSEUDO_N * PRIOR_MASTERY) / (n_sum + FC_PRIOR_PSEUDO_N)
}

/// Evidence-shrunk mastery: with little evidence the raw estimate (which can't
/// tell a lucky guess from real skill) is pulled toward the FC-pooled prior;
/// with `n >> N_TARGET` it converges to the raw value.
pub fn mastery_adjusted(leaf: &Leaf, s: &LeafState, states: &HashMap<String, LeafState>) -> f32 {
    let n = evidence(s);
    let w = n / (n + N_TARGET);
    clamp01(w * mastery(leaf.is_cars, s) + (1.0 - w) * pooled_prior(leaf, states))
}

/// Blueprint-weighted readiness across all leaves -> 472..528. Uses the
/// evidence-shrunk mastery so unassessed/thin leaves read as their pooled
/// prior, not as whatever one data point said.
pub fn readiness(states: &HashMap<String, LeafState>) -> Readiness {
    let mut num = 0.0f32;
    let mut den = 0.0f32;
    for leaf in leaves() {
        let m = states
            .get(leaf.id)
            .map(|s| mastery_adjusted(&leaf, s, states))
            .unwrap_or_else(|| pooled_prior(&leaf, states));
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

/// Give-up rule: `None` when a score should be shown, `Some(reason)` naming
/// exactly why not otherwise. The whole-section check runs first because it
/// is a more specific, more actionable reason than a generic "not enough
/// data yet" — a 10,000-card deck that skips a whole section must not read
/// as ready just because its totals clear the bar (see PRD section 4 / 7c).
pub fn give_up_reason(total_reviews: u32, states: &HashMap<String, LeafState>) -> Option<String> {
    for section in taxonomy::ALL_SECTIONS.iter().copied() {
        let (w_sum, w_assessed) = leaves().iter().filter(|l| l.section == section).fold(
            (0.0f32, 0.0f32),
            |(ws, wa), l| {
                let assessed = states.get(l.id).map(|s| s.assessed).unwrap_or(false);
                (ws + l.weight, wa + if assessed { l.weight } else { 0.0 })
            },
        );
        if w_sum > 0.0 && w_assessed == 0.0 {
            return Some(format!(
                "No {} questions answered yet \u{2014} every section needs at least some coverage before a score is meaningful.",
                taxonomy::section_full_name(section)
            ));
        }
    }
    let cov = confidence(states).coverage;
    if total_reviews < MIN_GRADED_REVIEWS_FOR_SCORE || cov < MIN_COVERAGE_FOR_SCORE {
        return Some(format!(
            "Not enough data yet: {total_reviews}/{min_rev} graded reviews and {cov_pct:.0}%/{min_cov_pct:.0}% topic coverage.",
            min_rev = MIN_GRADED_REVIEWS_FOR_SCORE,
            cov_pct = cov * 100.0,
            min_cov_pct = MIN_COVERAGE_FOR_SCORE * 100.0,
        ));
    }
    None
}

/// The up-to-3 assessed leaves with the lowest evidence-shrunk mastery,
/// formatted for display. Empty when nothing is assessed yet.
pub fn top_reasons(states: &HashMap<String, LeafState>) -> Vec<String> {
    let mut scored: Vec<(Leaf, f32)> = leaves()
        .into_iter()
        .filter_map(|l| {
            let s = states.get(l.id)?;
            if !s.assessed {
                return None;
            }
            let m = mastery_adjusted(&l, s, states);
            Some((l, m))
        })
        .collect();
    scored.sort_by(|a, b| a.1.total_cmp(&b.1));
    scored
        .into_iter()
        .take(3)
        .map(|(leaf, m)| format!("{} is your weakest area at {:.0}% mastery", leaf.name, m * 100.0))
        .collect()
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
        let l = super::super::taxonomy::leaf("1A").unwrap();
        let none = HashMap::new();
        let mut s = LeafState::empty("1A");
        s.fluency = 1.0;
        s.application = 1.0;
        s.attempts = 1.0;
        s.freshness = 1.0;
        let thin = mastery_adjusted(&l, &s, &none);
        assert!(thin < 0.3, "thin evidence read {thin}");
        s.attempts = 50.0;
        let deep = mastery_adjusted(&l, &s, &none);
        assert!(deep > 0.85, "deep evidence read {deep}");
        assert!(deep > thin);
    }

    #[test]
    fn strong_fc_siblings_lift_a_thin_leaf() {
        // deep evidence on 1B/1C/1D at high mastery
        let mut states: HashMap<String, LeafState> = HashMap::new();
        for id in ["1B", "1C", "1D"] {
            let mut s = LeafState::empty(id);
            s.fluency = 0.9;
            s.application = 0.9;
            s.attempts = 30.0;
            s.freshness = 1.0;
            states.insert(id.to_string(), s);
        }
        let mut thin = LeafState::empty("1A");
        thin.fluency = 0.9;
        thin.application = 0.9;
        thin.attempts = 1.0;
        thin.freshness = 1.0;

        let l1a = super::super::taxonomy::leaf("1A").unwrap();
        let pooled = mastery_adjusted(&l1a, &thin, &states);
        let alone = mastery_adjusted(&l1a, &thin, &HashMap::new());
        assert!(pooled > alone + 0.2, "pooled {pooled} vs alone {alone}");

        // a different FC's thin leaf is unaffected by FC-1 evidence
        let l4a = super::super::taxonomy::leaf("4A").unwrap();
        let mut thin4 = thin.clone();
        thin4.id = "4A".into();
        let other = mastery_adjusted(&l4a, &thin4, &states);
        assert!(
            (other - alone).abs() < 1e-6,
            "other {other} vs alone {alone}"
        );
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

    #[test]
    fn give_up_when_a_whole_section_is_untouched() {
        // every non-CARS leaf assessed; CARS never attempted at all
        let mut states = HashMap::new();
        for l in leaves() {
            if l.is_cars {
                continue;
            }
            let mut s = LeafState::empty(l.id);
            s.assessed = true;
            s.fluency = 1.0;
            s.application = 1.0;
            s.attempts = 1000.0;
            s.freshness = 1.0;
            states.insert(l.id.to_string(), s);
        }
        let reason =
            give_up_reason(1000, &states).expect("a CARS blackout must block scoring");
        assert!(reason.contains("CARS"), "reason was: {reason}");
    }

    #[test]
    fn give_up_below_review_or_coverage_threshold() {
        let states = states_with(|l| LeafState::empty(l.id)); // nothing assessed
        let reason = give_up_reason(0, &states).expect("zero evidence must block scoring");
        assert!(!reason.is_empty());
    }

    #[test]
    fn score_shown_once_reviews_and_coverage_clear_the_bar() {
        let states = states_with(|l| {
            let mut s = LeafState::empty(l.id);
            s.assessed = true;
            s.fluency = 0.7;
            s.application = 0.7;
            s.attempts = 10.0;
            s.freshness = 1.0;
            s
        });
        assert_eq!(give_up_reason(MIN_GRADED_REVIEWS_FOR_SCORE, &states), None);
    }

    #[test]
    fn top_reasons_ranks_weakest_leaves_first() {
        let mut states = HashMap::new();
        for (id, mastery) in [("1A", 0.9f32), ("1B", 0.2), ("1C", 0.5)] {
            let mut s = LeafState::empty(id);
            s.assessed = true;
            s.fluency = mastery;
            s.application = mastery;
            s.attempts = 1000.0; // deep evidence so mastery_adjusted ~= mastery
            s.freshness = 1.0;
            states.insert(id.to_string(), s);
        }
        let reasons = top_reasons(&states);
        assert!(
            reasons[0].contains("Gene"),
            "weakest leaf (1B, 'Gene -> protein') should lead: {reasons:?}"
        );
    }
}
