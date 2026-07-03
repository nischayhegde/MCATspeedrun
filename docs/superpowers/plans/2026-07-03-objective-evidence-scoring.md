# Objective-Evidence Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 2026-07-03 objective-evidence scoring spec: untimed flashcards, chance-corrected + difficulty-weighted application, recovery-aware gate, schedule-aware rote spacing, FC-pooled shrinkage, per-student MCQ pace factor.

**Architecture:** All changes live in the Rust scoring layer (`rslib/src/mcat/`) plus one call site in `rslib/src/scheduler/service/mod.rs` and PRD prose. No proto or SQLite schema changes; the pace factor uses the collection config KV store. The TS reference engine (`mcat-ui/`) is intentionally untouched.

**Tech Stack:** Rust (rslib), cargo test. No TS/Python code changes (docs + possibly e2e expectations only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-objective-evidence-scoring-design.md` — constants exactly as listed there.
- No proto changes, no SQLite migrations (`mcatPaceFactor` lives in col config KV).
- `mcat-ui/src/engine` stays untouched (Rust is source of truth).
- Shell setup on this machine (cargo not on PATH):
  `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` before any cargo command.
- Test command: `cargo test -p anki mcat` (module-scoped), final gate `cargo test -p anki --lib`.
- rslib error handling: `AnkiError`/`Result` + snafu (existing patterns).

---

### Task 1: model.rs — constants, Review fields, schedule-aware spacing, recall credit

**Files:**
- Modify: `rslib/src/mcat/model.rs`

**Interfaces:**
- Produces: `Review.scheduled_days: f32`, `Review.difficulty: u8`,
  `Grade::recall_credit(self) -> f32`, reworked `Review::spacing_weight()`,
  constants `GUESS_RATE`, `SPEED_QUALITY_FLOOR`, `DIFF_EVIDENCE_STEP`,
  `APP_DEMONSTRATED_TARGET`, `APP_MIN_CORRECTED_ACCURACY`, `PARTIAL_CREDIT`,
  `FC_PRIOR_PSEUDO_N`, `PACE_MIN_SAMPLES`, `PACE_MIN`, `PACE_MAX`.
  Consumed by Tasks 2–5. NOTE: aggregate.rs/adapter.rs will not compile until
  Tasks 3/5 update their `Review { .. }` literals — run only model tests here.

- [ ] **Step 1: Add fields, constants, recall_credit, new spacing_weight**

In the `Review` struct after `objective`:

```rust
    /// Scheduled gap (days) the previous review set for this one; 0.0 when
    /// unknown (first review, learning steps).
    pub scheduled_days: f32,
    /// Item difficulty 1..=5 from `mcat::diff::N`; 3 when untagged.
    pub difficulty: u8,
```

Replace `spacing_weight`:

```rust
    /// Evidence weight of this review for fluency: how much forgetting the
    /// recall actually fought through. When the scheduled interval is known
    /// (review phase), estimate retrievability at answer time assuming the
    /// scheduler targeted R_TARGET at the due date — answering on schedule is
    /// full evidence at any interval length, answering early proportionally
    /// less. Otherwise (first exposure, learning steps) fall back to the
    /// elapsed-days ramp.
    pub fn spacing_weight(&self) -> f32 {
        if self.scheduled_days >= 1.0 && self.elapsed_days > 0.0 {
            let r_hat = R_TARGET.powf(self.elapsed_days / self.scheduled_days);
            clamp01((1.0 - r_hat) / (1.0 - R_TARGET))
        } else if self.elapsed_days <= 0.0 {
            if self.massed {
                0.0
            } else {
                1.0
            }
        } else {
            clamp01(self.elapsed_days / SPACING_FULL_DAYS)
        }
    }
```

On `Grade`:

```rust
    /// Recall credit as fluency evidence: full for Good/Easy, partial for
    /// Hard (a Partial LLM verdict, or a self-graded "hard"), none for Again.
    pub fn recall_credit(self) -> f32 {
        match self {
            Grade::Again => 0.0,
            Grade::Hard => PARTIAL_CREDIT,
            Grade::Good | Grade::Easy => 1.0,
        }
    }
```

Constants (replace the `SELF_GRADED_EVIDENCE_WEIGHT`/`APP_FLUENCY_FLOOR` block comment area additions):

```rust
// partial credit (Hard grade = Partial verdict or self-graded "hard")
pub const PARTIAL_CREDIT: f32 = 0.5;

// MCQ evidence model
pub const GUESS_RATE: f32 = 0.25; // 4-option chance rate (CARS included)
pub const SPEED_QUALITY_FLOOR: f32 = 0.7; // slowest correct still earns this
pub const DIFF_EVIDENCE_STEP: f32 = 0.15; // evidence scaling per difficulty step
pub const APP_DEMONSTRATED_TARGET: f32 = 1.3; // effective corrects to demonstrate
pub const APP_MIN_CORRECTED_ACCURACY: f32 = 0.5; // corrected-accuracy floor ditto

// FC-pooled shrinkage
pub const FC_PRIOR_PSEUDO_N: f32 = 10.0; // pseudo-evidence of the global prior

// per-student MCQ pace factor
pub const PACE_MIN_SAMPLES: usize = 20;
pub const PACE_MIN: f32 = 0.8;
pub const PACE_MAX: f32 = 1.25;
```

- [ ] **Step 2: Add model tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn review(elapsed_days: f32, scheduled_days: f32, massed: bool) -> Review {
        Review {
            ts_ms: 0,
            grade: Grade::Good,
            correct: true,
            ms: 5_000,
            kind: ItemKind::Flashcard,
            is_application: false,
            is_cars: false,
            elapsed_days,
            massed,
            productive_failure: false,
            latency: latency_for(ItemKind::Flashcard),
            objective: true,
            scheduled_days,
            difficulty: 3,
        }
    }

    #[test]
    fn schedule_aware_spacing_weight() {
        // on schedule = full evidence at any interval length
        assert!((review(2.0, 2.0, false).spacing_weight() - 1.0).abs() < 1e-3);
        assert!((review(60.0, 60.0, false).spacing_weight() - 1.0).abs() < 1e-3);
        // early review = proportionally weaker
        let early = review(5.0, 10.0, false).spacing_weight();
        assert!(early > 0.4 && early < 0.6, "early weight {early}");
        // overdue clamps at 1.0
        assert_eq!(review(30.0, 10.0, false).spacing_weight(), 1.0);
        // unknown schedule falls back to the elapsed ramp
        assert!((review(1.5, 0.0, false).spacing_weight() - 0.5).abs() < 1e-6);
        assert_eq!(review(0.0, 0.0, false).spacing_weight(), 1.0); // first
        assert_eq!(review(0.0, 0.0, true).spacing_weight(), 0.0); // massed
    }

    #[test]
    fn recall_credit_mapping() {
        assert_eq!(Grade::Again.recall_credit(), 0.0);
        assert_eq!(Grade::Hard.recall_credit(), PARTIAL_CREDIT);
        assert_eq!(Grade::Good.recall_credit(), 1.0);
        assert_eq!(Grade::Easy.recall_credit(), 1.0);
    }
}
```

- [ ] **Step 3: Run model tests** — `cargo test -p anki mcat::model` — expect PASS (aggregate/adapter still broken until Tasks 3/5; use `cargo test -p anki mcat::model --no-fail-fast 2>&1 | head` if the crate build blocks, then proceed to Task 2/3 and re-run).

*(Compile note: Tasks 1–5 are one compile unit in practice; commit after the crate is green at Task 3 and Task 5 boundaries.)*

### Task 2: grader.rs — untimed verdict mapping

**Files:**
- Modify: `rslib/src/mcat/grader.rs`
- Modify: `rslib/src/mcat/adapter.rs` (two call sites)

**Interfaces:**
- Produces: `grade_typed(verdict: Verdict) -> Grade` (ms parameter removed);
  `typed_latency()` deleted.

- [ ] **Step 1: Rewrite grade_typed, delete typed_latency**

```rust
/// Map an LLM verdict to the FSRS grade. Flashcards are untimed: typing
/// speed is noise, and the verdict is the objective correctness signal.
pub fn grade_typed(verdict: Verdict) -> Grade {
    match verdict {
        Verdict::Incorrect => Grade::Again,
        Verdict::Partial => Grade::Hard,
        Verdict::Correct => Grade::Good,
    }
}
```

Delete `typed_latency()` and its doc comment. Update grader tests:

```rust
#[test]
fn verdicts_map_to_grades_untimed() {
    assert_eq!(grade_typed(Verdict::Incorrect), Grade::Again);
    assert_eq!(grade_typed(Verdict::Partial), Grade::Hard);
    assert_eq!(grade_typed(Verdict::Correct), Grade::Good);
}
```

- [ ] **Step 2: Update adapter call sites**

`mcat_answer_card_typed`: `let grade = grade_typed(graded.verdict);`
`build_card_reviews`: delete the `typed_latency` branch —

```rust
        let objective = is_app || objective_ids.contains(&ts);
```

(and use the passed `latency` unconditionally in the Review literal; remove the
`use super::grader::grade_typed;`-adjacent import of `typed_latency` if any).

- [ ] **Step 3: Run** `cargo test -p anki mcat::grader` — expect PASS (typed answer flow test in adapter still asserts Partial→Hard, unchanged).

### Task 3: aggregate.rs — consistency fluency, corrected application, recovery gate

**Files:**
- Modify: `rslib/src/mcat/aggregate.rs`

**Interfaces:**
- Consumes: `Grade::recall_credit`, `Review.difficulty`, new `spacing_weight`,
  constants from Task 1.
- Produces: same `score_leaf(&Leaf, &[Review], &[RoteMemory], i64) -> LeafState`
  signature; semantics per spec §§1–4.

- [ ] **Step 1: Rewrite the scoring internals of `score_leaf`**

Keep `recency_weight`, `fastness`, `app_spacing_weights`. Delete the generic
`weighted_mean`. New body after the rote/app partition:

```rust
    let evidence_weight = |r: &Review, sw: f32| -> f32 {
        let age_days = (now_ms - r.ts_ms) as f32 / DAY_MS as f32;
        recency_weight(age_days) * sw
    };

    // durability = mean current retrievability across rote cards (unchanged)
    let durability = ...; // existing code

    // consistency = recency+spacing-weighted recall credit of rote reviews.
    // Flashcards are untimed: the verdict (or button) is the signal, latency
    // is not. Partial verdicts earn half credit; first-exposure misses are
    // instruction, not evidence, and are excluded.
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
    // spacing x recall credit x objectivity discount
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

    // application = chance-corrected accuracy x speed quality.
    // Accuracy evidence is difficulty-weighted: a correct on a hard item (or
    // a miss on an easy one) is stronger evidence than the reverse.
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
        pv += base * dw * if r.correct { 1.0 } else { 0.0 };
        if r.correct {
            qw += base;
            qv += base
                * (SPEED_QUALITY_FLOOR
                    + (1.0 - SPEED_QUALITY_FLOOR) * fastness(r.ms, r.latency));
        }
    }
    let accuracy = if pw > 0.0 { pv / pw } else { 0.0 };
    let corrected = clamp01((accuracy - GUESS_RATE) / (1.0 - GUESS_RATE));
    let speed_quality = if qw > 0.0 { qv / qw } else { 1.0 };
    let application = corrected * speed_quality;

    // demonstrated application: enough effective corrects since `cut`, AND
    // whole-history corrected accuracy clear of the guessing floor — one
    // lucky 25% guess must never open the gate (PRD: consistency, never a
    // single data point).
    let app_correct_since = |cut: i64| -> f32 {
        app_reviews
            .iter()
            .zip(&app_spacing)
            .filter(|(r, _)| r.ts_ms > cut && r.correct)
            .map(|(_, &w)| w)
            .sum()
    };
    let app_demonstrated = |cut: i64| -> bool {
        app_correct_since(cut) >= APP_DEMONSTRATED_TARGET
            && corrected >= APP_MIN_CORRECTED_ACCURACY
    };

    let mut fluency = if leaf.is_cars {
        0.0
    } else {
        clamp01(0.5 * durability + 0.5 * consistency)
    };
    if !leaf.is_cars && app_demonstrated(i64::MIN) {
        fluency = fluency.max(APP_FLUENCY_FLOOR.max(application));
    }

    // recovery-aware gate: a genuine miss closes the gate immediately, and
    // the student re-earns it with the same evidence bar as the first time —
    // counted only from reviews after the most recent genuine miss.
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
```

`freshness` unchanged. `attempts` becomes (productive failures are
instruction, not evidence):

```rust
    let attempts = rote_reviews
        .iter()
        .filter(|r| !r.productive_failure)
        .map(|r| r.spacing_weight())
        .sum::<f32>()
        + app_spacing.iter().sum::<f32>();
```

- [ ] **Step 2: Rewrite the test module**

Fixture helpers gain the new fields (`scheduled_days: 0.0, difficulty: 3`);
`rote_review` gains a `grade` parameter variant `rote_review_graded(days_ago,
grade, massed)` where `correct = grade != Grade::Again`. Tests:

- keep (behavior unchanged): `cars_is_application_only_and_always_open`,
  `massed_cramming_does_not_open_gate_but_spaced_recalls_do`,
  `same_day_application_attempts_diminish`,
  `self_graded_evidence_is_discounted_for_the_gate`,
  `demonstrated_application_opens_gate_and_infers_fluency` (2 spaced corrects:
  1.0 + 1.0 ≥ 1.3, corrected accuracy 1.0 → opens; fluency → 1.0),
  `strong_application_lifts_fluency_above_the_floor`.
- delete: `mid_speed_recalls_earn_partial_automaticity`,
  `slow_rote_stays_below_gate` (latency-based).
- replace `weak_demonstrated_application_keeps_the_fluency_floor` with:

```rust
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
    // 25% accuracy spread over days = chance; corrected application ~ 0
    let l = leaf("1B").unwrap();
    let mut reviews = Vec::new();
    for i in 0..8 {
        reviews.push(app_review(20 - 2 * i, i % 4 == 0, 30_000, false));
    }
    let s = score_leaf(&l, &reviews, &[], NOW);
    assert!(s.application < 0.1, "guesser read {}", s.application);
    assert!(!s.gate_open);
}

#[test]
fn hard_item_correctness_counts_more() {
    let l = leaf("1B").unwrap();
    let hist = |d_correct: u8, d_wrong: u8| {
        let mut a = app_review(10, true, 30_000, false);
        a.difficulty = d_correct;
        let mut b = app_review(5, false, 90_000, false);
        b.difficulty = d_wrong;
        score_leaf(&l, &[a, b], &[], NOW).application
    };
    assert!(hist(5, 5) > hist(1, 1));
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
    let rote_mem = vec![RoteMemory { retrievability_now: 0.8, reps: 3 }];
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
    assert!((f_full - 0.9).abs() < 1e-3); // 0.5*0.8 + 0.5*1.0
    assert!((f_partial - 0.65).abs() < 1e-3); // 0.5*0.8 + 0.5*0.5
}

#[test]
fn productive_failure_is_instruction_not_evidence() {
    let l = leaf("1A").unwrap();
    let rote_mem = vec![RoteMemory { retrievability_now: 0.8, reps: 2 }];
    let mut miss = rote_review_graded(30, Grade::Again, false);
    miss.productive_failure = true;
    let reviews = vec![miss, rote_review_graded(8, Grade::Good, false)];
    let s = score_leaf(&l, &reviews, &rote_mem, NOW);
    // consistency = 1.0 (the PF miss is excluded), fluency = 0.5*0.8 + 0.5
    assert!((s.fluency - 0.9).abs() < 1e-3, "fluency was {}", s.fluency);
    // but one spaced correct is still below the gate's evidence bar
    assert!(!s.gate_open);
}
```

- [ ] **Step 3: Run** `cargo test -p anki mcat::aggregate` — expect PASS (adapter still red until Task 5 if signatures drifted; fix forward).

- [ ] **Step 4: Commit** — `feat(mcat): consistency-based untimed flashcard fluency; chance-corrected, difficulty-weighted application; recovery-aware gate`

### Task 4: taxonomy.rs + scoring.rs + service — FC-pooled shrinkage

**Files:**
- Modify: `rslib/src/mcat/taxonomy.rs`, `rslib/src/mcat/scoring.rs`,
  `rslib/src/scheduler/service/mod.rs:483`

**Interfaces:**
- Produces: `Leaf.fc: &'static str`;
  `mastery_adjusted(leaf: &Leaf, s: &LeafState, states: &HashMap<String, LeafState>) -> f32`.

- [ ] **Step 1: taxonomy — add the FC group id**

`FcDef` gains `fc: &'static str` set per block (`"4"`, `"5"`, `"1"`, `"2"`,
`"3"`, `"6"`, `"7"`, `"8"`, `"9"`, `"10"`); `Leaf` gains `pub fc: &'static str`,
populated from the FcDef; CARS leaves get `fc: "CARS"`.

- [ ] **Step 2: scoring — pooled prior**

```rust
/// Sibling-pooled shrinkage prior: what this leaf's foundational-concept
/// siblings' evidence suggests, blended with the global prior. With no
/// sibling evidence this is exactly PRIOR_MASTERY; with strong siblings a
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

/// Evidence-shrunk mastery: thin estimates are pulled toward the FC-pooled
/// prior; with n >> N_TARGET it converges to the raw value.
pub fn mastery_adjusted(
    leaf: &Leaf,
    s: &LeafState,
    states: &HashMap<String, LeafState>,
) -> f32 {
    let n = evidence(s);
    let w = n / (n + N_TARGET);
    clamp01(w * mastery(leaf.is_cars, s) + (1.0 - w) * pooled_prior(leaf, states))
}
```

`readiness()` uses `mastery_adjusted(&leaf, s, states)` and, for missing
leaves, `pooled_prior(&leaf, states)` instead of `PRIOR_MASTERY`.
Update `build_mcat_readiness` (service/mod.rs:483):
`mastery: scoring::mastery_adjusted(&leaf, &s, &states)`.

- [ ] **Step 3: Tests**

Update `thin_evidence_shrinks_toward_prior` and `readiness_bounds` to the new
signature (empty sibling states reproduce the old numbers exactly). Add:

```rust
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

    let l1a = leaf("1A").unwrap();
    let pooled = mastery_adjusted(&l1a, &thin, &states);
    let alone = mastery_adjusted(&l1a, &thin, &HashMap::new());
    assert!(pooled > alone + 0.2, "pooled {pooled} vs alone {alone}");

    // a different FC's thin leaf is unaffected by FC-1 evidence
    let l4a = leaf("4A").unwrap();
    let mut thin4 = thin.clone();
    thin4.id = "4A".into();
    let other = mastery_adjusted(&l4a, &thin4, &states);
    assert!((other - alone).abs() < 1e-6);
}
```

- [ ] **Step 4: Run** `cargo test -p anki mcat::scoring mcat::taxonomy` and `cargo check -p anki` (service call site). Expect PASS.

- [ ] **Step 5: Commit** — `feat(mcat): FC-pooled hierarchical shrinkage for thin-evidence mastery`

### Task 5: adapter.rs — scheduled_days, difficulty, PF fix, pace factor

**Files:**
- Modify: `rslib/src/mcat/adapter.rs`

**Interfaces:**
- Consumes: Task 1 fields/constants.
- Produces: `build_card_reviews(entries, kind, is_app, cars, latency, difficulty, objective_ids)`;
  `pace_factor_from_ratios(ratios: Vec<f32>) -> f32`; config key
  `const MCAT_PACE_FACTOR_KEY: &str = "mcatPaceFactor"`;
  `Collection::mcat_refresh_pace_factor()` called from `mcat_recompute_all`.

- [ ] **Step 1: Review construction**

`build_card_reviews` gains a `difficulty: u8` parameter; track the previous
entry's interval; productive failure becomes a flashcard-only concept (a wrong
first attempt on a fresh MCQ is a genuine signal — instruction already
happened at the rote stage):

```rust
    let mut prev_interval: i32 = 0;
    ...
    let productive_failure = !is_app && reps == 0 && !correct;
    let scheduled_days = if prev_interval > 0 { prev_interval as f32 } else { 0.0 };
    ...
    out.push(Review { ..., scheduled_days, difficulty, ... });
    prev_ts = Some(ts);
    prev_interval = e.interval;
```

Caller (`mcat_leaf_inputs`) passes `difficulty_from_tags(&note.tags)`.

- [ ] **Step 2: Pace factor**

```rust
const MCAT_PACE_FACTOR_KEY: &str = "mcatPaceFactor";

/// Median observed/expected time ratio, clamped; 1.0 with thin data.
fn pace_factor_from_ratios(mut ratios: Vec<f32>) -> f32 {
    if ratios.len() < PACE_MIN_SAMPLES {
        return 1.0;
    }
    ratios.sort_by(|a, b| a.total_cmp(b));
    ratios[ratios.len() / 2].clamp(PACE_MIN, PACE_MAX)
}
```

`Collection::mcat_refresh_pace_factor` (called first in
`mcat_recompute_all`): scan `tag:mcat::*` application/CARS cards; for each
revlog entry with `button_chosen > 1 && taken_millis > 0` push
`taken_millis / midpoint` where `midpoint = (t.fast + t.slow) as f32 / 2.0`
of the item's **unpaced** rc/ct thresholds; store via
`self.transact_no_undo(|col| col.set_config(MCAT_PACE_FACTOR_KEY, &factor).map(|_| ()))`.

Reading side: `note_expected_latency(tags, kind)` is renamed
`note_expected_latency_unpaced`; a new wrapper applies the stored factor to
MCQ kinds only:

```rust
impl Collection {
    fn mcat_pace_factor(&self) -> f32 {
        self.get_config_optional(MCAT_PACE_FACTOR_KEY).unwrap_or(1.0)
    }

    /// Per-item thresholds, widened/narrowed by the student's own measured
    /// pace (MCQs only; flashcards are untimed).
    fn note_paced_latency(&self, tags: &[String], kind: ItemKind) -> Latency {
        let t = note_expected_latency_unpaced(tags, kind);
        if matches!(kind, ItemKind::Flashcard) {
            return t;
        }
        let f = self.mcat_pace_factor();
        Latency {
            fast: (t.fast as f32 * f).round() as u32,
            slow: (t.slow as f32 * f).round() as u32,
        }
    }
}
```

Call sites `adapter.rs:166` and `adapter.rs:555` use `self.note_paced_latency(...)`.

- [ ] **Step 3: Tests**

```rust
#[test]
fn scheduled_days_comes_from_previous_interval() { /* two synthetic RevlogEntry
    rows, first with interval 3 -> second Review.scheduled_days == 3.0;
    first Review.scheduled_days == 0.0 */ }

#[test]
fn wrong_first_mcq_attempt_is_not_productive_failure() { /* is_app = true,
    single wrong entry -> productive_failure == false; flashcard equivalent
    stays true */ }

#[test]
fn pace_factor_median_and_clamp() {
    assert_eq!(pace_factor_from_ratios(vec![1.5; 5]), 1.0); // thin data
    let slow = vec![1.4_f32; 25];
    assert_eq!(pace_factor_from_ratios(slow), PACE_MAX); // clamped
    let fast = vec![0.5_f32; 25];
    assert_eq!(pace_factor_from_ratios(fast), PACE_MIN);
    let mixed: Vec<f32> = (0..25).map(|i| 0.9 + 0.01 * i as f32).collect();
    let f = pace_factor_from_ratios(mixed);
    assert!((f - 1.02).abs() < 0.02);
}
```

- [ ] **Step 4: Run** `cargo test -p anki mcat` — the whole module green.

- [ ] **Step 5: Commit** — `feat(mcat): schedule-aware spacing inputs, difficulty tags, per-student MCQ pace factor`

### Task 6: PRD + full gate

**Files:**
- Modify: `planning/PRD.md` (FLUENCY, evidence rules, OBJECTIVE FLUENCY
  SIGNAL, SCORE DYNAMICS, GRADING & RATING, parameters list)
- Check: `mcat_tools/e2e_test.py`, `mcat_tools/e2e_typed_grading.py`
  (assertions on typed grades — fast correct is now Good, never Easy)

- [ ] **Step 1: PRD edits** — flashcards are untimed (verdict-only; latency
  applies to MCQs); fluency = FSRS durability + spaced verdict consistency
  (partial = half credit); application = chance-corrected accuracy ×
  speed quality with difficulty-weighted evidence; demonstrated application
  threshold (≥ ~2 effective corrects and corrected accuracy ≥ 0.5); gate
  re-earned after a lapse; readiness shrinks toward FC-pooled priors;
  per-student MCQ pace factor. Update the tunables list.
- [ ] **Step 2: e2e expectation check** — grep both e2e scripts for grade
  assertions (`== 4`, `Easy`); update to Good where they cover typed correct
  answers.
- [ ] **Step 3: Full gate** — `cargo test -p anki --lib` green; `cargo fmt`
  on touched files (`rustfmt` via `$env:USERPROFILE\.cargo\bin`).
- [ ] **Step 4: Commit** — `docs(mcat): PRD reflects untimed flashcards + objective-evidence scoring`

## Self-Review

- Spec coverage: §1→Tasks 2+3, §2/§3/§4→Task 3, §5→Tasks 1+5, §6→Task 4,
  §7→Task 5, PRD→Task 6. ✓
- Placeholders: none (Task 3 Step 1 elides only code explicitly marked
  "existing/unchanged").
- Type consistency: `recall_credit`/`scheduled_days`/`difficulty` names match
  across Tasks 1/3/5; `mastery_adjusted(&Leaf, &LeafState, &HashMap)` matches
  Task 4 and the service call site. ✓
