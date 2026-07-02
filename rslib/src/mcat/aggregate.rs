// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Derives per-leaf study state (fluency/application/gate/freshness/depth) from
//! the review log + FSRS retrievability. This is the scoring layer that sits on
//! top of FSRS. Ported from `mcat-ui/src/engine/aggregate.ts`.

use super::model::*;
use super::taxonomy::Leaf;

fn recency_weight(age_days: f32) -> f32 {
    (-age_days.max(0.0) / RECENCY_TAU_DAYS).exp()
}

/// Speed credit for a recall: 1.0 at/below the fast threshold, 0.0 at/above
/// slow, linear in between. Automaticity evidence is continuous — a recall
/// just over the fast threshold is far stronger evidence than one just under
/// slow, and a step function would cap fluency for anyone answering at a
/// normal (Good) pace.
fn fastness(ms: u32, t: Latency) -> f32 {
    if ms <= t.fast {
        1.0
    } else if ms >= t.slow {
        0.0
    } else {
        (t.slow - ms) as f32 / (t.slow - t.fast) as f32
    }
}

/// Weighted mean over reviews, each weighted recency x spacing: recent
/// evidence counts more, and well-spaced evidence counts more (the spacing
/// effect is continuous, not a same-day cliff).
fn weighted_mean<F>(reviews: &[&Review], spacing: &[f32], now_ms: i64, val: F) -> f32
where
    F: Fn(&Review) -> f32,
{
    let mut ws = 0.0f32;
    let mut vs = 0.0f32;
    for (&r, &sw) in reviews.iter().zip(spacing) {
        let age_days = (now_ms - r.ts_ms) as f32 / DAY_MS as f32;
        let w = recency_weight(age_days) * sw;
        ws += w;
        vs += w * val(r);
    }
    if ws > 0.0 {
        vs / ws
    } else {
        0.0
    }
}

/// Spacing weights for application attempts. MCQs are one-shot per card, so
/// the gap is measured between consecutive application attempts *within the
/// leaf*. Same-day attempts are distinct fresh problems — correlated but still
/// evidence — hence the floor rather than a zero (this also lets a diagnostic,
/// which answers several items per leaf in one sitting, seed estimates).
fn app_spacing_weights(app_reviews: &[&Review]) -> Vec<f32> {
    let mut out = Vec::with_capacity(app_reviews.len());
    let mut prev_ts: Option<i64> = None;
    for r in app_reviews {
        let w = match prev_ts {
            None => 1.0,
            Some(p) => {
                let gap_days = (r.ts_ms - p) as f32 / DAY_MS as f32;
                clamp01(gap_days / APP_SPACING_FULL_DAYS).max(APP_SPACING_FLOOR)
            }
        };
        out.push(w);
        prev_ts = Some(r.ts_ms);
    }
    out
}

/// Compute the [`LeafState`] for a single leaf from its reviews + rote
/// memories.
pub fn score_leaf(leaf: &Leaf, reviews: &[Review], rote: &[RoteMemory], now_ms: i64) -> LeafState {
    // sort by timestamp ascending (by reference)
    let mut sorted: Vec<&Review> = reviews.iter().collect();
    sorted.sort_by_key(|r| r.ts_ms);

    let rote_reviews: Vec<&Review> = sorted
        .iter()
        .copied()
        .filter(|r| r.kind == ItemKind::Flashcard)
        .collect();
    let app_reviews: Vec<&Review> = sorted
        .iter()
        .copied()
        .filter(|r| r.is_application || r.is_cars)
        .collect();

    // durability = mean current retrievability across rote cards
    let durability = if rote.is_empty() {
        0.0
    } else {
        rote.iter().map(|m| m.retrievability_now).sum::<f32>() / rote.len() as f32
    };

    // automaticity = recency+spacing-weighted fastness of correct rote recalls.
    // The spacing weight replaces the old binary massed filter: a same-day
    // repeat contributes ~nothing, a 3+ day gap counts fully, in between is
    // proportional evidence.
    let rote_spacing: Vec<f32> = rote_reviews.iter().map(|r| r.spacing_weight()).collect();
    let automaticity = weighted_mean(&rote_reviews, &rote_spacing, now_ms, |r| {
        if r.correct {
            fastness(r.ms, r.latency)
        } else {
            0.0
        }
    });
    // effective spaced-correct: sum of spacing weights over correct recalls
    let spaced_correct: f32 = rote_reviews
        .iter()
        .zip(&rote_spacing)
        .filter(|(r, _)| r.correct)
        .map(|(_, &w)| w)
        .sum();

    // application = recency+spacing-weighted correctness (with a speed bonus)
    let app_spacing = app_spacing_weights(&app_reviews);
    let application = weighted_mean(&app_reviews, &app_spacing, now_ms, |r| {
        if !r.correct {
            return 0.0;
        }
        if r.ms <= r.latency.fast {
            1.0
        } else {
            0.7
        }
    });
    let application_demonstrated = app_reviews.iter().any(|r| r.correct);

    // fluency: durability + automaticity; demonstrated application implies
    // fluency — at least the floor, tracking the application score above it
    // so an application-strong leaf isn't pinned at the floor forever
    let mut fluency = if leaf.is_cars {
        0.0
    } else {
        clamp01(0.5 * durability + 0.5 * automaticity)
    };
    if !leaf.is_cars && application_demonstrated {
        fluency = fluency.max(APP_FLUENCY_FLOOR.max(application));
    }

    // demotion: latest evidence is a genuine (post-learning) lapse -> gate closes
    let latest = sorted.last();
    let recent_lapse = latest
        .map(|r| !r.correct && !r.productive_failure && sorted.len() > 1)
        .unwrap_or(false);

    let gate_open = if leaf.is_cars {
        true
    } else {
        !recent_lapse
            && ((fluency >= FLUENCY_THRESHOLD && spaced_correct >= SPACED_CORRECT_TARGET)
                || application_demonstrated)
    };

    let last_app_age = app_reviews
        .last()
        .map(|r| (now_ms - r.ts_ms) as f32 / DAY_MS as f32);
    let freshness = if leaf.is_cars {
        last_app_age.map(recency_weight).unwrap_or(0.0)
    } else if !rote.is_empty() {
        durability
    } else {
        last_app_age.map(recency_weight).unwrap_or(0.0)
    };

    // evidence depth = effective spaced attempts (sum of spacing weights), so
    // ten massed repeats don't read as ten independent data points
    let attempts = rote_spacing.iter().sum::<f32>() + app_spacing.iter().sum::<f32>();

    LeafState {
        id: leaf.id.to_string(),
        fluency: clamp01(fluency),
        application: clamp01(application),
        attempts,
        freshness: clamp01(freshness),
        assessed: !sorted.is_empty(),
        gate_open,
    }
}

#[cfg(test)]
mod tests {
    use super::super::taxonomy::leaf;
    use super::*;

    const NOW: i64 = 1_700_000_000_000;

    fn rote_review(days_ago: i64, correct: bool, ms: u32, massed: bool) -> Review {
        Review {
            ts_ms: NOW - days_ago * DAY_MS,
            grade: if correct { Grade::Good } else { Grade::Again },
            correct,
            ms,
            kind: ItemKind::Flashcard,
            is_application: false,
            is_cars: false,
            elapsed_days: days_ago as f32,
            massed,
            productive_failure: false,
            latency: latency_for(ItemKind::Flashcard),
        }
    }

    fn app_review(days_ago: i64, correct: bool, ms: u32, is_cars: bool) -> Review {
        let kind = if is_cars {
            ItemKind::Cars
        } else {
            ItemKind::Application
        };
        Review {
            ts_ms: NOW - days_ago * DAY_MS,
            grade: if correct { Grade::Easy } else { Grade::Again },
            correct,
            ms,
            kind,
            is_application: !is_cars,
            is_cars,
            elapsed_days: 0.0,
            massed: false,
            productive_failure: false,
            latency: latency_for(kind),
        }
    }

    #[test]
    fn demonstrated_application_opens_gate_and_infers_fluency() {
        let l = leaf("1B").unwrap();
        let reviews = vec![
            app_review(20, true, 30_000, false),
            app_review(8, true, 30_000, false),
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.gate_open);
        assert!(s.fluency >= 0.8);
        assert!(s.application > 0.8);
        assert!(s.assessed);
    }

    #[test]
    fn slow_rote_stays_below_gate() {
        let l = leaf("1A").unwrap();
        // one first-exposure miss then one spaced, mid-speed correct recall
        let mut miss = rote_review(30, false, 13_000, false);
        miss.productive_failure = true;
        let reviews = vec![miss, rote_review(8, true, 10_000, false)];
        let rote = vec![RoteMemory {
            retrievability_now: 0.8,
            reps: 2,
        }];
        let s = score_leaf(&l, &reviews, &rote, NOW);
        assert!(!s.gate_open, "fluency was {}", s.fluency);
        assert!(s.assessed);
    }

    #[test]
    fn mid_speed_recalls_earn_partial_automaticity() {
        // fastness is a continuous ramp, not a 0.4 step: a spaced 7s recall on
        // a well-retained leaf must read well above the old ~0.65 ceiling
        let l = leaf("1A").unwrap();
        let reviews = vec![rote_review(5, true, 7_000, false)];
        let rote = vec![RoteMemory {
            retrievability_now: 0.9,
            reps: 3,
        }];
        let s = score_leaf(&l, &reviews, &rote, NOW);
        assert!(s.fluency > 0.85, "fluency was {}", s.fluency);
    }

    #[test]
    fn strong_application_lifts_fluency_above_the_floor() {
        // implied fluency tracks the application score instead of pinning at
        // exactly 0.8 forever
        let l = leaf("1B").unwrap();
        let reviews = vec![
            app_review(10, true, 30_000, false),
            app_review(5, true, 30_000, false),
            app_review(1, true, 30_000, false),
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.application > 0.95, "application was {}", s.application);
        assert!(s.fluency > 0.95, "fluency was {}", s.fluency);
    }

    #[test]
    fn weak_demonstrated_application_keeps_the_fluency_floor() {
        // one correct among misses: the PRD floor holds, but no more
        let l = leaf("1B").unwrap();
        let reviews = vec![
            app_review(10, true, 30_000, false),
            app_review(1, false, 130_000, false),
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.application < 0.5, "application was {}", s.application);
        assert!((s.fluency - 0.8).abs() < 1e-6, "fluency was {}", s.fluency);
    }

    #[test]
    fn cars_is_application_only_and_always_open() {
        let l = leaf("CARS1").unwrap();
        let reviews = vec![app_review(10, true, 55_000, true)];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.gate_open);
        assert_eq!(s.fluency, 0.0);
        assert!(s.application > 0.0);
    }

    #[test]
    fn massed_cramming_does_not_open_gate_but_spaced_recalls_do() {
        let l = leaf("1A").unwrap();
        let rote_mem = vec![RoteMemory {
            retrievability_now: 0.95,
            reps: 5,
        }];

        // cramming: first exposure + four fast same-day repeats
        let mut crammed = vec![rote_review(0, true, 3_000, false)];
        for _ in 0..4 {
            crammed.push(rote_review(0, true, 3_000, true));
        }
        let s = score_leaf(&l, &crammed, &rote_mem, NOW);
        assert!(!s.gate_open, "cramming opened the gate");
        assert!(
            s.attempts < 1.5,
            "5 massed repeats read as {} attempts",
            s.attempts
        );

        // the same fast correct recalls spaced across days count fully
        let spaced = vec![
            rote_review(20, true, 3_000, false),
            rote_review(10, true, 3_000, false),
            rote_review(5, true, 3_000, false),
        ];
        let s = score_leaf(&l, &spaced, &rote_mem, NOW);
        assert!(s.gate_open, "spaced fast recalls should open the gate");
        assert!(s.attempts > 2.5);
    }

    #[test]
    fn same_day_application_attempts_diminish() {
        let l = leaf("1B").unwrap();
        // three attempts in one sitting (diagnostic-style): distinct fresh
        // problems, so they still count, but as correlated evidence
        let same_day: Vec<Review> = (0..3).map(|_| app_review(0, true, 30_000, false)).collect();
        let s = score_leaf(&l, &same_day, &[], NOW);
        assert!((s.attempts - 1.6).abs() < 1e-3, "attempts {}", s.attempts);

        // the same three attempts spread across days are independent evidence
        let spread = vec![
            app_review(10, true, 30_000, false),
            app_review(5, true, 30_000, false),
            app_review(1, true, 30_000, false),
        ];
        let s = score_leaf(&l, &spread, &[], NOW);
        assert!((s.attempts - 3.0).abs() < 1e-3, "attempts {}", s.attempts);
    }

    #[test]
    fn recent_genuine_lapse_closes_gate() {
        let l = leaf("1C").unwrap();
        let reviews = vec![
            app_review(20, true, 30_000, false),
            app_review(15, true, 30_000, false),
            app_review(1, false, 130_000, false), // recent wrong (not first exposure)
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(!s.gate_open);
    }
}
