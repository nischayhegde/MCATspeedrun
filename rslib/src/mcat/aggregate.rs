// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Derives per-leaf study state (fluency/application/gate/freshness/depth) from
//! the review log + FSRS retrievability. This is the scoring layer that sits on
//! top of FSRS.

use super::model::*;
use super::taxonomy::Leaf;

fn recency_weight(age_days: f32) -> f32 {
    (-age_days.max(0.0) / RECENCY_TAU_DAYS).exp()
}

/// Speed credit for a correct MCQ answer: 1.0 at/below the fast threshold,
/// 0.0 at/above slow, linear in between. Speed evidence is continuous — an
/// answer just over the fast threshold is far stronger evidence than one just
/// under slow. Flashcards are untimed and never consult this.
fn fastness(ms: u32, t: Latency) -> f32 {
    if ms <= t.fast {
        1.0
    } else if ms >= t.slow {
        0.0
    } else {
        (t.slow - ms) as f32 / (t.slow - t.fast) as f32
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

    let evidence_weight = |r: &Review, sw: f32| -> f32 {
        let age_days = (now_ms - r.ts_ms) as f32 / DAY_MS as f32;
        recency_weight(age_days) * sw
    };

    // durability = mean current retrievability across rote cards
    let durability = if rote.is_empty() {
        0.0
    } else {
        rote.iter().map(|m| m.retrievability_now).sum::<f32>() / rote.len() as f32
    };

    // consistency = recency+spacing-weighted recall credit of rote reviews.
    // Flashcards are untimed: the verdict (or grade button) is the signal,
    // latency is not. Partial verdicts earn half credit, and first-exposure
    // misses are instruction (productive failure), not evidence.
    let mut cw = 0.0f32;
    let mut cv = 0.0f32;
    for r in &rote_reviews {
        if r.productive_failure {
            continue;
        }
        let w = evidence_weight(r, r.spacing_weight());
        cw += w;
        cv += w * r.grade.recall_credit();
    }
    let consistency = if cw > 0.0 { cv / cw } else { 0.0 };

    // effective spaced-correct toward the gate, counted only after `cut`:
    // spacing x recall credit x objectivity discount. Verdict-backed recalls
    // count fully; legacy self-graded ones are discounted — an "Easy" click
    // is weak evidence (PRD: Hendrick).
    let spaced_correct_since = |cut: i64| -> f32 {
        rote_reviews
            .iter()
            .filter(|r| r.ts_ms > cut && r.correct)
            .map(|r| {
                r.spacing_weight()
                    * r.grade.recall_credit()
                    * if r.objective {
                        1.0
                    } else {
                        SELF_GRADED_EVIDENCE_WEIGHT
                    }
            })
            .sum()
    };

    // application = chance-corrected accuracy x speed quality. Accuracy
    // evidence is difficulty-weighted: a correct on a hard item (or a miss on
    // an easy one) is stronger evidence than the reverse. The chance
    // correction means a blind 4-option guesser converges to ~0, not ~0.25.
    let app_spacing = app_spacing_weights(&app_reviews);
    let mut pw = 0.0f32;
    let mut pv = 0.0f32;
    let mut qw = 0.0f32;
    let mut qv = 0.0f32;
    for (&r, &sw) in app_reviews.iter().zip(&app_spacing) {
        let base = evidence_weight(r, sw);
        let step = DIFF_EVIDENCE_STEP * (r.difficulty as f32 - 3.0);
        let dw = if r.correct { 1.0 + step } else { 1.0 - step };
        pw += base * dw;
        if r.correct {
            pv += base * dw;
            qw += base;
            qv += base
                * (SPEED_QUALITY_FLOOR + (1.0 - SPEED_QUALITY_FLOOR) * fastness(r.ms, r.latency));
        }
    }
    let accuracy = if pw > 0.0 { pv / pw } else { 0.0 };
    let corrected = clamp01((accuracy - GUESS_RATE) / (1.0 - GUESS_RATE));
    let speed_quality = if qw > 0.0 { qv / qw } else { 1.0 };
    let application = corrected * speed_quality;

    // demonstrated application: enough effective corrects since `cut`, AND
    // whole-history corrected accuracy clear of the guessing floor — a single
    // lucky 25% guess must never open the gate (PRD: consistency across
    // multiple attempts, never a single data point).
    let app_correct_since = |cut: i64| -> f32 {
        app_reviews
            .iter()
            .zip(&app_spacing)
            .filter(|(r, _)| r.ts_ms > cut && r.correct)
            .map(|(_, &w)| w)
            .sum()
    };
    let app_demonstrated = |cut: i64| -> bool {
        app_correct_since(cut) >= APP_DEMONSTRATED_TARGET && corrected >= APP_MIN_CORRECTED_ACCURACY
    };

    // fluency: durability + consistency; demonstrated application implies
    // fluency — at least the floor, tracking the application score above it
    // so an application-strong leaf isn't pinned at the floor forever
    let mut fluency = if leaf.is_cars {
        0.0
    } else {
        clamp01(0.5 * durability + 0.5 * consistency)
    };
    if !leaf.is_cars && app_demonstrated(i64::MIN) {
        fluency = fluency.max(APP_FLUENCY_FLOOR.max(application));
    }

    // recovery-aware gate: a genuine (post-learning) miss closes the gate
    // immediately, and the student re-earns it with the same evidence bar as
    // the first time — counted only from reviews after the most recent miss.
    let lapse_ts = sorted
        .iter()
        .rev()
        .find(|r| !r.correct && !r.productive_failure)
        .map(|r| r.ts_ms)
        .unwrap_or(i64::MIN);

    let gate_open = if leaf.is_cars {
        true
    } else {
        (fluency >= FLUENCY_THRESHOLD && spaced_correct_since(lapse_ts) >= SPACED_CORRECT_TARGET)
            || app_demonstrated(lapse_ts)
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
    // ten massed repeats don't read as ten independent data points; first-
    // exposure misses are instruction, not evidence
    let attempts = rote_reviews
        .iter()
        .filter(|r| !r.productive_failure)
        .map(|r| r.spacing_weight())
        .sum::<f32>()
        + app_spacing.iter().sum::<f32>();

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

    fn rote_review_graded(days_ago: i64, grade: Grade, massed: bool) -> Review {
        Review {
            ts_ms: NOW - days_ago * DAY_MS,
            grade,
            correct: grade != Grade::Again,
            ms: 5_000,
            kind: ItemKind::Flashcard,
            is_application: false,
            is_cars: false,
            elapsed_days: days_ago as f32,
            massed,
            productive_failure: false,
            latency: latency_for(ItemKind::Flashcard),
            objective: true,
            scheduled_days: 0.0,
            difficulty: 3,
        }
    }

    fn rote_review(days_ago: i64, correct: bool, massed: bool) -> Review {
        rote_review_graded(
            days_ago,
            if correct { Grade::Good } else { Grade::Again },
            massed,
        )
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
            objective: true,
            scheduled_days: 0.0,
            difficulty: 3,
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
    fn single_lucky_correct_does_not_open_gate_or_pin_floor() {
        let l = leaf("1B").unwrap();
        let s = score_leaf(&l, &[app_review(10, true, 30_000, false)], &[], NOW);
        assert!(!s.gate_open, "one correct guess opened the gate");
        assert_eq!(s.fluency, 0.0, "one correct guess pinned the fluency floor");

        // one correct among a recent miss: corrected accuracy below the floor
        let reviews = vec![
            app_review(10, true, 30_000, false),
            app_review(1, false, 130_000, false),
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(!s.gate_open);
        assert_eq!(s.fluency, 0.0);
    }

    #[test]
    fn guesser_reads_near_zero_application() {
        // ~25% accuracy spread over days = chance; corrected application ~ 0
        let l = leaf("1B").unwrap();
        let mut reviews = Vec::new();
        for i in 0..8i64 {
            reviews.push(app_review(20 - 2 * i, i % 4 == 0, 30_000, false));
        }
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.application < 0.1, "guesser read {}", s.application);
        assert!(!s.gate_open);
    }

    #[test]
    fn hard_item_correctness_counts_more() {
        let l = leaf("1B").unwrap();
        let hist = |d: u8| {
            let mut a = app_review(10, true, 30_000, false);
            a.difficulty = d;
            let mut b = app_review(5, false, 90_000, false);
            b.difficulty = d;
            score_leaf(&l, &[a, b], &[], NOW).application
        };
        assert!(hist(5) > hist(1), "hard {} <= easy {}", hist(5), hist(1));
    }

    #[test]
    fn lapse_closes_gate_and_recovery_reearns_it() {
        let l = leaf("1C").unwrap();
        let mut reviews = vec![
            app_review(20, true, 30_000, false),
            app_review(15, true, 30_000, false),
            app_review(10, false, 130_000, false), // genuine lapse
        ];
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(!s.gate_open, "lapse did not close the gate");

        // one post-lapse correct is not enough to reopen
        reviews.push(app_review(8, true, 30_000, false));
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(!s.gate_open, "single correct reopened the gate");

        // a second spaced post-lapse correct re-earns it
        reviews.push(app_review(4, true, 30_000, false));
        let s = score_leaf(&l, &reviews, &[], NOW);
        assert!(s.gate_open, "recovery evidence failed to reopen the gate");
    }

    #[test]
    fn partial_recalls_earn_half_credit() {
        let l = leaf("1A").unwrap();
        let rote_mem = vec![RoteMemory {
            retrievability_now: 0.8,
            reps: 3,
        }];
        let full = vec![
            rote_review_graded(10, Grade::Good, false),
            rote_review_graded(5, Grade::Good, false),
        ];
        let partial = vec![
            rote_review_graded(10, Grade::Hard, false),
            rote_review_graded(5, Grade::Hard, false),
        ];
        let f_full = score_leaf(&l, &full, &rote_mem, NOW).fluency;
        let f_partial = score_leaf(&l, &partial, &rote_mem, NOW).fluency;
        assert!((f_full - 0.9).abs() < 1e-3, "full was {f_full}");
        assert!((f_partial - 0.65).abs() < 1e-3, "partial was {f_partial}");
    }

    #[test]
    fn productive_failure_is_instruction_not_evidence() {
        let l = leaf("1A").unwrap();
        let rote_mem = vec![RoteMemory {
            retrievability_now: 0.8,
            reps: 2,
        }];
        let mut miss = rote_review(30, false, false);
        miss.productive_failure = true;
        let reviews = vec![miss, rote_review(8, true, false)];
        let s = score_leaf(&l, &reviews, &rote_mem, NOW);
        // consistency = 1.0 (the PF miss is excluded): 0.5*0.8 + 0.5*1.0
        assert!((s.fluency - 0.9).abs() < 1e-3, "fluency was {}", s.fluency);
        // but one spaced correct is still below the gate's evidence bar
        assert!(!s.gate_open);
        assert!(s.assessed);
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
        let mut crammed = vec![rote_review(0, true, false)];
        for _ in 0..4 {
            crammed.push(rote_review(0, true, true));
        }
        let s = score_leaf(&l, &crammed, &rote_mem, NOW);
        assert!(!s.gate_open, "cramming opened the gate");
        assert!(
            s.attempts < 1.5,
            "5 massed repeats read as {} attempts",
            s.attempts
        );

        // the same correct recalls spaced across days count fully
        let spaced = vec![
            rote_review(20, true, false),
            rote_review(10, true, false),
            rote_review(5, true, false),
        ];
        let s = score_leaf(&l, &spaced, &rote_mem, NOW);
        assert!(s.gate_open, "spaced correct recalls should open the gate");
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
    fn self_graded_evidence_is_discounted_for_the_gate() {
        // the same spaced correct history that opens the gate when
        // verdict-backed (see massed_cramming test) is only half evidence
        // when it came from self-pressed grade buttons
        let l = leaf("1A").unwrap();
        let rote_mem = vec![RoteMemory {
            retrievability_now: 0.95,
            reps: 5,
        }];
        let mut self_rated = vec![
            rote_review(20, true, false),
            rote_review(10, true, false),
            rote_review(5, true, false),
        ];
        for r in &mut self_rated {
            r.objective = false;
        }
        let s = score_leaf(&l, &self_rated, &rote_mem, NOW);
        assert!(
            !s.gate_open,
            "self-graded clicks alone opened the fluency gate"
        );
    }
}
