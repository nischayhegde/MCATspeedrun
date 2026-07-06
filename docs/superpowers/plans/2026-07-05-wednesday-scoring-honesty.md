# Wednesday Scoring Honesty & Rust-Change Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two highest-severity gaps against the project rubric's Wednesday deadline: (1) the readiness score currently has no give-up rule and is proven by an existing test to render a fake number at zero evidence, and (2) "the Rust change" is missing its required Python-callable test and its merge-difficulty/why-Rust writeup. This plan makes the desktop MCAT dashboard (and, for free, the mobile client, since both read the same RPC) refuse to show a score until a stated bar is cleared, shows an explicit range/last-updated/reasons alongside any score it does show, and closes the two documentation/testing gaps in the existing Rust change.

**Architecture:** All gating logic lives in one place — a new `scoring::give_up_reason()` pure function in `rslib/src/mcat/scoring.rs` — called from a single `Collection::mcat_readiness()` method in `rslib/src/mcat/adapter.rs` that returns a new `McatReadinessBundle`. The existing RPC handler (`build_mcat_readiness` in `rslib/src/scheduler/service/mod.rs`) becomes a thin proto-assembly layer over that bundle, so desktop and mobile (which both call the same `ComputeMcatReadiness`/`RecomputeMcatLeafStates` RPCs per the existing LAN client) automatically get the same honest behavior with no separate mobile-side change.

**Tech Stack:** Rust (rslib), Protobuf (proto/anki/scheduler.proto), Python (pylib/tests, pytest), Svelte/TypeScript (ts/routes/mcat).

## Global Constraints

- Exam is MCAT, scale 472–528, four sections scored 118–132 each (Chem/Phys, Bio/Biochem, Psych/Soc, CARS). State this explicitly in the README (Task 8).
- Give-up rule (this plan's chosen line, matching the rubric's own worked example): **no score until at least 200 graded reviews AND at least 50% blueprint coverage AND every one of the 4 MCAT sections has at least one assessed leaf.** Encoded as `MIN_GRADED_REVIEWS_FOR_SCORE = 200` and `MIN_COVERAGE_FOR_SCORE = 0.5` in `rslib/src/mcat/model.rs`.
- When the give-up rule fires, the RPC response's numeric score fields (`readiness_score`, `readiness_pct`, `confidence_pct`, `confidence_band`, `range_low`, `range_high`) must be zero and `reasons` must be empty — never a real-looking number with a caveat bolted on. The `ready` boolean is the only thing a client should branch on.
- Do not add a new `impl Collection` block outside `rslib/src/mcat/`. This codebase's existing pattern (confirmed via `git diff` against the pre-MCAT commit `afab61519ead03178cddbc53bbde74ddc74d0153`) keeps all MCAT-owned Rust in `rslib/src/mcat/*` and `rslib/src/storage/mcat/*` as wholly new files, touching only 8 existing upstream files by a combined +343/−2 lines (`proto/anki/frontend.proto`, `proto/anki/scheduler.proto`, `rslib/src/backend/mod.rs`, `rslib/src/lib.rs`, `rslib/src/scheduler/answering/mod.rs`, `rslib/src/scheduler/service/mod.rs`, `rslib/src/storage/mod.rs`, `rslib/src/storage/sqlite.rs`). This plan's changes must preserve that shape — see Task 7.
- Per `CLAUDE.md`, use `just` recipes only (`just check`, `just test-rust`, `just test-py`), never `./ninja`/`./run`/`tools/*` directly. `.proto` file edits require a full `just check` before Python/TS bindings regenerate.
- Follow existing test conventions exactly: Rust tests live in `#[cfg(test)] mod tests` at the bottom of the file they test; Python tests use `from tests.shared import getEmptyCol` and live in `pylib/tests/`.

---

### Task 1: Give-up rule + top-reasons pure functions in `scoring.rs`

**Files:**
- Modify: `rslib/src/mcat/model.rs` (add constants)
- Modify: `rslib/src/mcat/taxonomy.rs` (add `ALL_SECTIONS` + `section_full_name`)
- Modify: `rslib/src/mcat/scoring.rs` (add `give_up_reason`, `top_reasons`, tests)

**Interfaces:**
- Produces: `scoring::give_up_reason(total_reviews: u32, states: &HashMap<String, LeafState>) -> Option<String>` — `None` means "show the score"; `Some(reason)` is the exact user-facing explanation.
- Produces: `scoring::top_reasons(states: &HashMap<String, LeafState>) -> Vec<String>` — up to 3 lines, weakest-mastery leaf first.
- Produces: `taxonomy::ALL_SECTIONS: [Section; 4]` and `taxonomy::section_full_name(Section) -> &'static str`.
- Consumes: existing `LeafState`, `Leaf`, `mastery_adjusted`, `confidence` from this same module (no new imports needed there).

- [ ] **Step 1: Add the threshold constants**

In `rslib/src/mcat/model.rs`, add near the other calibration constants (after `pub const SCALE_POINTS: f32 = 56.0;`):

```rust
// give-up rule (readiness must not be shown below this bar — see PRD section 4)
pub const MIN_GRADED_REVIEWS_FOR_SCORE: u32 = 200;
pub const MIN_COVERAGE_FOR_SCORE: f32 = 0.5;
```

- [ ] **Step 2: Add section helpers to `taxonomy.rs`**

In `rslib/src/mcat/taxonomy.rs`, insert immediately before `pub fn leaves() -> Vec<Leaf> {`:

```rust
/// All four MCAT sections, for coverage/give-up checks that need to iterate
/// every section (as opposed to every leaf).
pub const ALL_SECTIONS: [Section; 4] =
    [Section::Cpbs, Section::Bbls, Section::Psbb, Section::Cars];

/// Full display name for a section, for user-facing give-up-rule messages
/// (contrast with the short "C/P"/"B/B"/"P/S"/"CARS" labels used elsewhere).
pub fn section_full_name(section: Section) -> &'static str {
    match section {
        Section::Cpbs => "Chemical/Physical Foundations",
        Section::Bbls => "Biological/Biochemical Foundations",
        Section::Psbb => "Psychological/Social/Biological Foundations",
        Section::Cars => "CARS",
    }
}
```

- [ ] **Step 3: Write the failing tests in `scoring.rs`**

Add to the `#[cfg(test)] mod tests` block at the bottom of `rslib/src/mcat/scoring.rs` (after `confidence_increases_with_evidence`):

```rust
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
```

- [ ] **Step 4: Run the tests to verify they fail to compile**

Run: `cargo test -p anki --lib mcat::scoring:: 2>&1 | tail -30`
Expected: FAIL — `cannot find function 'give_up_reason'` / `'top_reasons'` in this scope.

- [ ] **Step 5: Implement `give_up_reason` and `top_reasons`**

In `rslib/src/mcat/scoring.rs`, add `use super::taxonomy;` to the imports at the top (alongside the existing `use super::taxonomy::leaves;` / `use super::taxonomy::Leaf;`), then add after `leaf_def` and before `#[cfg(test)]`:

```rust
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test -p anki --lib mcat::scoring:: 2>&1 | tail -30`
Expected: PASS — all 4 new tests plus the existing scoring tests green.

- [ ] **Step 7: Commit**

```bash
git add rslib/src/mcat/model.rs rslib/src/mcat/taxonomy.rs rslib/src/mcat/scoring.rs
git commit -m "feat(mcat): give-up rule + top-reasons pure functions"
```

---

### Task 2: Persisted review counter + `McatReadinessBundle`

**Files:**
- Modify: `rslib/src/mcat/model.rs` (add `McatReadinessBundle`)
- Modify: `rslib/src/mcat/adapter.rs` (counter, rewritten `mcat_readiness`, tests)

**Interfaces:**
- Consumes: `scoring::give_up_reason`, `scoring::top_reasons` from Task 1.
- Produces: `Collection::mcat_total_graded_reviews(&self) -> u32`, `Collection::mcat_readiness(&self) -> Result<McatReadinessBundle>` (replaces the old unused tuple-returning `mcat_readiness`), and `model::McatReadinessBundle { readiness: Readiness, confidence: Confidence, total_reviews: u32, give_up_reason: Option<String>, reasons: Vec<String>, states: HashMap<String, LeafState> }` — Task 3 consumes all of these fields.

- [ ] **Step 1: Add `McatReadinessBundle` to `model.rs`**

Add `use std::collections::HashMap;` at the top of `rslib/src/mcat/model.rs`, then add after the `Confidence` struct:

```rust
/// Full readiness computation, including give-up gating. `give_up_reason` is
/// `Some` when [`Readiness`]/[`Confidence`] must not be shown to the student;
/// `reasons` (top contributing factors) is only populated when it is `None`.
#[derive(Clone, Debug)]
pub struct McatReadinessBundle {
    pub readiness: Readiness,
    pub confidence: Confidence,
    pub total_reviews: u32,
    pub give_up_reason: Option<String>,
    pub reasons: Vec<String>,
    pub states: HashMap<String, LeafState>,
}
```

- [ ] **Step 2: Write the failing tests in `adapter.rs`**

Add to the `#[cfg(test)] mod tests` block in `rslib/src/mcat/adapter.rs` (after `application_marker_detected`):

```rust
    #[test]
    fn total_graded_reviews_counts_and_resets() {
        let mut col = Collection::new();
        let mut note = NoteAdder::basic(&mut col)
            .fields(&["Glycolysis", "Splits glucose into two pyruvate"])
            .add(&mut col);
        note.tags.push("mcat::cc::1D".into());
        col.update_note(&mut note).unwrap();
        let card = col.get_first_card();

        assert_eq!(col.mcat_total_graded_reviews(), 0);
        col.mcat_answer_card(card.id, true, 4_000, 3).unwrap();
        assert_eq!(col.mcat_total_graded_reviews(), 1);
        col.mcat_answer_card(card.id, true, 4_000, 3).unwrap();
        assert_eq!(col.mcat_total_graded_reviews(), 2);

        col.mcat_reset_progress().unwrap();
        assert_eq!(col.mcat_total_graded_reviews(), 0);
    }

    #[test]
    fn mcat_readiness_bundle_reports_give_up_reason_cold() {
        let col = Collection::new();
        let bundle = col.mcat_readiness().unwrap();
        assert!(bundle.give_up_reason.is_some());
        assert!(bundle.reasons.is_empty());
        assert_eq!(bundle.total_reviews, 0);
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cargo test -p anki --lib mcat::adapter:: 2>&1 | tail -40`
Expected: FAIL — `no method named 'mcat_total_graded_reviews'` (compile error), since it doesn't exist yet.

- [ ] **Step 4: Add the counter key + getter, and wire the increment/reset**

In `rslib/src/mcat/adapter.rs`, add the new config key near `MCAT_PACE_FACTOR_KEY`:

```rust
/// Collection-config key for the total count of graded MCAT reviews, used by
/// the give-up rule. Incremented once per accepted answer (both MCQ and
/// flashcard paths, in `mcat_apply_grade`), reset to 0 by `mcat_reset_progress`.
const MCAT_TOTAL_REVIEWS_KEY: &str = "mcatTotalGradedReviews";
```

Add this method to the `impl Collection` block, near `mcat_pace_factor`:

```rust
    /// Total graded MCAT reviews recorded so far, used by the give-up rule.
    pub(crate) fn mcat_total_graded_reviews(&self) -> u32 {
        self.get_config_optional(MCAT_TOTAL_REVIEWS_KEY).unwrap_or(0)
    }
```

Change the tail of `mcat_apply_grade` (the free function near the bottom of the file) from:

```rust
    answer.from_queue = false;
    col.answer_card_inner(&mut answer)
}
```

to:

```rust
    answer.from_queue = false;
    col.answer_card_inner(&mut answer)?;
    let total = col.mcat_total_graded_reviews() + 1;
    col.set_config(MCAT_TOTAL_REVIEWS_KEY, &total)?;
    Ok(())
}
```

Change the `transact_no_undo` block in `mcat_reset_progress` from:

```rust
        self.transact_no_undo(|col| {
            col.storage.clear_revlog_for_cards(&ids)?;
            col.storage.clear_mcat_answer_log()?;
            col.storage.clear_mcat_leaf_states()
        })?;
```

to:

```rust
        self.transact_no_undo(|col| {
            col.storage.clear_revlog_for_cards(&ids)?;
            col.storage.clear_mcat_answer_log()?;
            col.storage.clear_mcat_leaf_states()?;
            col.set_config(MCAT_TOTAL_REVIEWS_KEY, &0u32)
        })?;
```

- [ ] **Step 5: Replace `mcat_readiness` with the gated bundle version**

Replace the existing method:

```rust
    /// Blueprint-weighted readiness + confidence from the persisted leaf
    /// states.
    pub fn mcat_readiness(&self) -> Result<(Readiness, Confidence)> {
        let states: HashMap<String, LeafState> = self
            .storage
            .all_mcat_leaf_states()?
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect();
        Ok((scoring::readiness(&states), scoring::confidence(&states)))
    }
```

with:

```rust
    /// Blueprint-weighted readiness + confidence from the persisted leaf
    /// states, gated by the give-up rule (see [`scoring::give_up_reason`]).
    pub fn mcat_readiness(&self) -> Result<McatReadinessBundle> {
        let states: HashMap<String, LeafState> = self
            .storage
            .all_mcat_leaf_states()?
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect();
        let total_reviews = self.mcat_total_graded_reviews();
        let give_up_reason = scoring::give_up_reason(total_reviews, &states);
        let reasons = if give_up_reason.is_none() {
            scoring::top_reasons(&states)
        } else {
            Vec::new()
        };
        Ok(McatReadinessBundle {
            readiness: scoring::readiness(&states),
            confidence: scoring::confidence(&states),
            total_reviews,
            give_up_reason,
            reasons,
            states,
        })
    }
```

(`McatReadinessBundle` is already in scope via the existing `use super::model::*;` import at the top of `adapter.rs` — no new import needed.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test -p anki --lib mcat:: 2>&1 | tail -50`
Expected: PASS — all `mcat::` tests green, including the 2 new ones. If `total_graded_reviews_counts_and_resets` fails on the reset assertion, check that `clear_mcat_leaf_states()?` (now with `?`) still type-checks against `set_config`'s return type inside the closure — both must resolve to the same `Result<()>`.

- [ ] **Step 7: Commit**

```bash
git add rslib/src/mcat/model.rs rslib/src/mcat/adapter.rs
git commit -m "feat(mcat): persisted graded-review counter + gated readiness bundle"
```

---

### Task 3: Proto fields + RPC wiring

**Files:**
- Modify: `proto/anki/scheduler.proto`
- Modify: `rslib/src/scheduler/service/mod.rs`

**Interfaces:**
- Consumes: `Collection::mcat_readiness() -> Result<McatReadinessBundle>` from Task 2.
- Produces: `McatReadinessResponse` proto fields `ready`, `not_ready_reason`, `range_low`, `range_high`, `last_updated_ms`, `reasons`, `total_graded_reviews` — Task 4 (Python test) and Task 6 (Svelte) consume these by name.

- [ ] **Step 1: Add the new fields to the proto message**

In `proto/anki/scheduler.proto`, inside `message McatReadinessResponse { ... }`, after the existing `repeated McatLeafState leaves = 8;` line, add:

```proto
  // False when the give-up rule blocks scoring; all numeric fields above
  // are 0 and `reasons` is empty in that case. Clients must check this
  // before rendering any of the score fields.
  bool ready = 9;
  // Empty when ready; otherwise the exact reason a score isn't shown yet.
  string not_ready_reason = 10;
  // Likely range on the 472..528 scale (score -/+ confidence_band, clamped).
  // 0 when not ready.
  int32 range_low = 11;
  int32 range_high = 12;
  // Epoch ms when this estimate was computed.
  int64 last_updated_ms = 13;
  // Up to 3 lines naming the weakest contributing subtopics. Empty when
  // not ready.
  repeated string reasons = 14;
  // Total graded MCAT reviews recorded so far (numerator of the give-up
  // rule's review-count check).
  uint32 total_graded_reviews = 15;
```

- [ ] **Step 2: Rewrite `build_mcat_readiness` in `service/mod.rs`**

Replace the entire function body of `fn build_mcat_readiness(col: &mut Collection) -> Result<scheduler::McatReadinessResponse> { ... }` (currently reading `col.mcat_leaf_states()?` directly and computing `readiness`/`confidence` inline) with:

```rust
fn build_mcat_readiness(col: &mut Collection) -> Result<scheduler::McatReadinessResponse> {
    use crate::mcat::model::LeafState;
    use crate::mcat::scoring;
    use crate::mcat::taxonomy;
    use crate::mcat::taxonomy::Section;

    fn section_label(section: Section) -> &'static str {
        match section {
            Section::Cpbs => "C/P",
            Section::Bbls => "B/B",
            Section::Psbb => "P/S",
            Section::Cars => "CARS",
        }
    }

    let bundle = col.mcat_readiness()?;
    let ready = bundle.give_up_reason.is_none();

    let leaves = taxonomy::leaves()
        .into_iter()
        .map(|leaf| {
            let s = bundle
                .states
                .get(leaf.id)
                .cloned()
                .unwrap_or_else(|| LeafState::empty(leaf.id));
            scheduler::McatLeafState {
                leaf_id: leaf.id.to_string(),
                name: leaf.name.to_string(),
                section: section_label(leaf.section).to_string(),
                is_cars: leaf.is_cars,
                weight: leaf.weight,
                fluency: s.fluency,
                application: s.application,
                mastery: scoring::mastery_adjusted(&leaf, &s, &bundle.states),
                attempts: s.attempts.round() as u32,
                freshness: s.freshness,
                assessed: s.assessed,
                gate_open: s.gate_open,
            }
        })
        .collect();

    let (readiness_pct, readiness_score, confidence_pct, confidence_band, range_low, range_high) =
        if ready {
            let band = bundle.confidence.band;
            (
                bundle.readiness.pct,
                bundle.readiness.score,
                bundle.confidence.pct,
                band,
                (bundle.readiness.score - band).clamp(472, 528),
                (bundle.readiness.score + band).clamp(472, 528),
            )
        } else {
            (0.0, 0, 0.0, 0, 0, 0)
        };

    Ok(scheduler::McatReadinessResponse {
        readiness_pct,
        readiness_score,
        confidence_pct,
        coverage: bundle.confidence.coverage,
        depth: bundle.confidence.depth,
        freshness: bundle.confidence.freshness,
        confidence_band,
        leaves,
        ready,
        not_ready_reason: bundle.give_up_reason.unwrap_or_default(),
        range_low,
        range_high,
        last_updated_ms: TimestampMillis::now().0,
        reasons: bundle.reasons,
        total_graded_reviews: bundle.total_reviews,
    })
}
```

`TimestampMillis` is already in scope in this file via the existing `use crate::prelude::*;` import — no new import needed. Delete the old inline `use std::collections::HashMap;` / `use crate::mcat::model::LeafState;` / `use crate::mcat::scoring;` / `use crate::mcat::taxonomy;` / `use crate::mcat::taxonomy::Section;` lines that were at the top of the *old* function body if your editor left them duplicated — the block above already re-declares the ones it needs.

- [ ] **Step 3: Full rebuild to regenerate Python + TS bindings**

Run: `just check`
Expected: builds clean. This regenerates `out/pylib/anki/_backend_generated.py` (new `McatReadinessResponse` fields) and the TS `@generated/anki/scheduler_pb` module — both required by Tasks 4 and 6.

- [ ] **Step 4: Commit**

```bash
git add proto/anki/scheduler.proto rslib/src/scheduler/service/mod.rs
git commit -m "feat(mcat): thread give-up rule + range/reasons/timestamp through the readiness RPC"
```

---

### Task 4: Python test calling the Rust binding directly

**Files:**
- Create: `pylib/tests/test_mcat.py`

**Interfaces:**
- Consumes: `col._backend.compute_mcat_readiness()`, `col._backend.answer_mcat_card(...)` (generated bindings from Task 3), `tests.shared.getEmptyCol`.

This closes the rubric's "1 test that calls it [the Rust change] from Python" requirement — the existing `mcat_tools/e2e_test.py` only drives the built app via browser automation, never calls the backend binding directly.

- [ ] **Step 1: Write the test**

Create `pylib/tests/test_mcat.py`:

```python
# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

from tests.shared import getEmptyCol


def _add_and_answer(col, leaf_id: str) -> None:
    note = col.newNote()
    note["Front"] = f"stub front {leaf_id}"
    note["Back"] = f"stub back {leaf_id}"
    note.add_tag(leaf_id)
    col.addNote(note)
    card = note.cards()[0]
    col._backend.answer_mcat_card(
        card_id=card.id, correct=True, milliseconds_taken=5_000, self_rating=3
    )


def test_readiness_withholds_score_below_the_give_up_bar():
    col = getEmptyCol()
    resp = col._backend.compute_mcat_readiness()
    assert resp.ready is False
    assert resp.not_ready_reason != ""
    assert resp.readiness_score == 0
    assert len(resp.reasons) == 0
    # the taxonomy is enumerated regardless of assessment, so all 34 leaves
    # are present even with zero notes imported
    assert len(resp.leaves) == 34


def test_readiness_shown_once_reviews_and_coverage_clear_the_bar():
    col = getEmptyCol()
    leaf_ids = [leaf.leaf_id for leaf in col._backend.compute_mcat_readiness().leaves]
    assert len(leaf_ids) == 34

    # one review per leaf: covers every leaf (100% >= 50%) and every section
    for leaf_id in leaf_ids:
        _add_and_answer(col, leaf_id)

    # pad up to the 200-review floor by repeating the first leaf's card
    first_note_tag_card = col.find_cards(f"tag:{leaf_ids[0]}")[0]
    for _ in range(200 - len(leaf_ids)):
        col._backend.answer_mcat_card(
            card_id=first_note_tag_card,
            correct=True,
            milliseconds_taken=5_000,
            self_rating=3,
        )

    resp = col._backend.compute_mcat_readiness()
    assert resp.total_graded_reviews >= 200
    assert resp.ready is True
    assert resp.not_ready_reason == ""
    assert 472 <= resp.readiness_score <= 528
    assert resp.range_low <= resp.readiness_score <= resp.range_high
    assert len(resp.reasons) > 0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `just test-py` (or, for just this file once pytest config is known-good, check `justfile`'s `_test-py` recipe output for how to scope it — it runs `tools\ninja check:pytest`, which runs the full suite; that's fine for a first pass)
Expected: FAIL, because before Task 3 lands `compute_mcat_readiness()` has no `ready`/`not_ready_reason`/`range_low`/`range_high`/`reasons`/`total_graded_reviews` attributes (`AttributeError`). If Tasks 1–3 are already done by the time you reach this task, it should instead run and pass on the first try — treat any failure here as a real bug, not an expected step.

- [ ] **Step 3: Run again to verify it passes**

Run: `just test-py`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pylib/tests/test_mcat.py
git commit -m "test(mcat): python test calling compute_mcat_readiness through the real backend binding"
```

---

### Task 5: Undo-preservation test for the MCAT answer flow

**Files:**
- Modify: `rslib/src/mcat/adapter.rs` (test only)

**Interfaces:**
- Consumes: `Collection::mcat_answer_card`, `Collection::undo()`, `Collection::mcat_total_graded_reviews()` (existing/Task 2).

This closes the rubric's "proof that undo still works" requirement for the Rust change, and doubles as a correctness check on the new counter from Task 2 — if `set_config` inside `mcat_apply_grade`'s `self.transact(Op::AnswerCard, ...)` closure isn't undo-tracked, this test will genuinely fail and expose a real bug (a student could otherwise inflate the give-up-rule counter by answer-then-undo cycling).

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` block in `rslib/src/mcat/adapter.rs`:

```rust
    #[test]
    fn answering_an_mcat_card_can_be_undone() {
        let mut col = Collection::new();
        let mut note = NoteAdder::basic(&mut col)
            .fields(&["Glycolysis", "Splits glucose into two pyruvate"])
            .add(&mut col);
        note.tags.push("mcat::cc::1D".into());
        col.update_note(&mut note).unwrap();
        let card = col.get_first_card();
        let before = col.storage.get_card(card.id).unwrap().unwrap();

        col.mcat_answer_card(card.id, true, 4_000, 3).unwrap();
        let after_answer = col.storage.get_card(card.id).unwrap().unwrap();
        assert_ne!(
            before.due, after_answer.due,
            "answering should have changed scheduling"
        );
        assert_eq!(col.mcat_total_graded_reviews(), 1);

        col.undo().unwrap();

        let after_undo = col.storage.get_card(card.id).unwrap().unwrap();
        assert_eq!(
            before.due, after_undo.due,
            "undo should restore pre-answer scheduling"
        );
        assert_eq!(before.queue, after_undo.queue);
        let entries = col.storage.get_revlog_entries_for_card(card.id).unwrap();
        assert!(entries.is_empty(), "undo should remove the revlog row too");
        assert_eq!(
            col.mcat_total_graded_reviews(),
            0,
            "the give-up-rule counter must roll back with everything else"
        );
    }
```

- [ ] **Step 2: Run the test**

Run: `cargo test -p anki --lib mcat::adapter::tests::answering_an_mcat_card_can_be_undone -- --nocapture`
Expected: PASS. If the final assertion (`mcat_total_graded_reviews() == 0`) fails, that means the config write in `mcat_apply_grade` is not participating in the `Op::AnswerCard` undo scope — read `rslib/src/config/undo.rs` for how config changes register undo actions, and either confirm `set_config` already does this automatically inside an ambient `transact` (matching the doc-comment convention next to `MCAT_PACE_FACTOR_KEY`'s sibling `mcat_refresh_pace_factor`, which deliberately opts *out* via `transact_no_undo`), or adjust Task 2's Step 4 to register the undo action explicitly before re-running this test.

- [ ] **Step 3: Commit**

```bash
git add rslib/src/mcat/adapter.rs
git commit -m "test(mcat): prove answer+undo restores scheduling, revlog, and the review counter"
```

---

### Task 6: Dashboard shows the give-up state, explicit range, timestamp, and reasons

**Files:**
- Modify: `ts/routes/mcat/McatDashboard.svelte`

**Interfaces:**
- Consumes: `McatReadinessResponse` fields `ready: boolean`, `notReadyReason: string`, `rangeLow: number`, `rangeHigh: number`, `lastUpdatedMs: bigint`, `reasons: string[]`, `totalGradedReviews: number` (all from Task 3's proto changes, generated into `@generated/anki/scheduler_pb` by Task 3 Step 3's `just check`).

- [ ] **Step 1: Add the not-ready branch and the new score-block content**

In `ts/routes/mcat/McatDashboard.svelte`, replace the `<div class="score-block">...</div>` through the closing `</div>` of `<div class="meta">` (currently lines 121–162, i.e. from `<div class="score-block">` down to the `{assessedCount} / {readiness.leaves.length} subtopics assessed` closing `</div>`) with:

```svelte
        {#if !readiness.ready}
            <div class="not-ready">
                <div class="not-ready-title">Not enough data for a score yet</div>
                <p class="not-ready-reason">{readiness.notReadyReason}</p>
                <div class="assessed">
                    {assessedCount} / {readiness.leaves.length} subtopics assessed &middot;
                    {readiness.totalGradedReviews} graded reviews
                    {#if refreshing}<span class="refreshing-note">refreshing…</span>{/if}
                </div>
            </div>
        {:else}
            <div class="score-block">
                <div class="score">{readiness.readinessScore}</div>
                <div class="scale">/ 528</div>
            </div>
            <div class="meta">
                <div class="mastery">
                    {Math.round(readiness.readinessPct)}% blueprint mastery
                </div>
                <div class="range">
                    Likely range: {readiness.rangeLow} to {readiness.rangeHigh}
                </div>
                <div class="confidence">
                    <span class="conf-pct">±{readiness.confidenceBand} pts</span>
                    <span class="conf-label">
                        {Math.round(readiness.confidencePct)}% confidence
                    </span>
                </div>
                <p class="rough-note">
                    Estimate is rough — you've assessed {pct(readiness.coverage)} of the blueprint.
                    Updated {new Date(Number(readiness.lastUpdatedMs)).toLocaleString()}.
                    {#if refreshing}<span class="refreshing-note">refreshing…</span>{/if}
                </p>
                {#if readiness.reasons.length > 0}
                    <ul class="reasons">
                        {#each readiness.reasons as reason}
                            <li>{reason}</li>
                        {/each}
                    </ul>
                {/if}
                <details class="conf-details">
                    <summary>How is this computed?</summary>
                    <div class="conf-breakdown">
                        <div class="conf-row">
                            <span class="conf-row-label">coverage</span>
                            <MeterBar value={readiness.coverage} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.coverage)}</span>
                        </div>
                        <div class="conf-row">
                            <span class="conf-row-label">depth</span>
                            <MeterBar value={readiness.depth} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.depth)}</span>
                        </div>
                        <div class="conf-row">
                            <span class="conf-row-label">freshness</span>
                            <MeterBar value={readiness.freshness} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.freshness)}</span>
                        </div>
                    </div>
                </details>
                <div class="assessed">
                    {assessedCount} / {readiness.leaves.length} subtopics assessed
                </div>
            </div>
        {/if}
```

Note the original markup had `<div class="score-block">` and `<div class="meta">` as two separate sibling divs (both direct children of `<header class="readiness">`); the replacement above keeps that sibling structure inside the `{:else}` branch so the existing `.readiness` CSS grid/flex layout (in this file's `<style>` block, not shown here) still applies without changes.

- [ ] **Step 2: Add minimal CSS for the new elements**

In this file's `<style>` block, find the existing `.rough-note` rule and add after it:

```css
    .not-ready {
        grid-column: 1 / -1;
    }
    .not-ready-title {
        font-weight: 600;
    }
    .not-ready-reason {
        color: var(--sf-muted, inherit);
    }
    .range {
        font-size: 0.9em;
    }
    .reasons {
        margin: 0.5em 0 0;
        padding-left: 1.2em;
        font-size: 0.9em;
    }
```

If `--sf-muted` isn't an existing CSS variable in this codebase, grep the file for other `var(--sf-` usages and reuse whichever muted/secondary-text token already exists instead of inventing a new one.

- [ ] **Step 3: Verify the Svelte/TypeScript checks pass**

Run: `just check`
Expected: `check:svelte` and `check:typescript` pass — this catches any field-name mismatch against the generated `McatReadinessResponse` type from Task 3.

- [ ] **Step 4: Manually verify in the running app**

Run: `just run`, open the MCAT dashboard on a fresh/reset profile (use the "Reset progress…" menu if it already has data) and confirm the not-ready message renders instead of a score; answer enough cards across every section to clear both thresholds and confirm the score, range, timestamp, and reasons list appear.

- [ ] **Step 5: Commit**

```bash
git add ts/routes/mcat/McatDashboard.svelte
git commit -m "feat(mcat): dashboard shows give-up state, explicit range, timestamp, and reasons"
```

---

### Task 7: Rust-change writeup (why Rust, upstream footprint, merge difficulty)

**Files:**
- Create: `docs/mcat-rust-change-notes.md`

- [ ] **Step 1: Write the doc**

Create `docs/mcat-rust-change-notes.md`:

```markdown
# The MCAT Rust change: why it's in Rust, and what it touches upstream

## What this is

A topic-aware scheduling + mastery/readiness query layer (`rslib/src/mcat/`)
that sits on top of Anki's existing FSRS scheduler: it interleaves rote
flashcards and application MCQs by blueprint weight × student weakness
(`mcat::scheduler::build_queue`), and computes a blueprint-weighted 472-528
readiness estimate with a give-up rule and confidence interval
(`mcat::scoring::readiness`/`confidence`/`give_up_reason`). Both are exposed
to Python and the web/mobile frontends via new protobuf RPCs
(`GetMcatStudyQueue`, `ComputeMcatReadiness`, and siblings in
`proto/anki/scheduler.proto`).

## Why Rust, not Python

- **Shared by two clients.** Desktop (Svelte/webview) and mobile (Expo, over
  a LAN RPC to the same backend) both need identical scheduling and scoring
  behavior. Anki's own scheduler already lives in Rust specifically so every
  frontend gets the same answer; putting MCAT scoring in Python would mean
  either duplicating it in Rust anyway for consistency, or accepting drift
  between platforms.
- **Runs on every answer.** `mcat_apply_grade` fires on every card review and
  recomputes one leaf's state; `mcat_study_queue` re-ranks the full MCAT-tagged
  card set on every session start. These are hot paths where Python's
  per-call overhead (and the existing Python/Rust FFI boundary cost) would be
  paid far more often than it needs to be — the 50k-card benchmark target
  (rubric 7h) is explicitly about this path.
- **Correctness under concurrent access.** Anki's collection is guarded by a
  single Rust-side transaction boundary (`Collection::transact`); doing the
  MCAT scoring write (leaf state + revlog + the new graded-review counter) in
  Python would mean coordinating a second transaction/undo system instead of
  reusing the one Anki already has, and undo semantics are exactly the kind
  of thing that's easy to get subtly wrong across a language boundary.

## Upstream footprint

Measured via `git diff <pre-mcat-commit> -- rslib pylib proto` against the
commit immediately before MCAT work began
(`afab61519ead03178cddbc53bbde74ddc74d0153`, parent of
`6aa4fd7ee "feat(mcat): learning-science scoring edits + full MCAT feature tree"`):

**Wholly new files (zero merge risk — nothing to reconcile with upstream changes to these paths, because upstream has no such paths):**

- `rslib/src/mcat/{adapter,aggregate,diagnostic,grader,leaf_tag,mod,model,scheduler,scoring,taxonomy}.rs`
- `rslib/src/storage/mcat/{create.sql,get.sql,mod.rs,upsert.sql}`

**Existing upstream files touched (all additive, +343/−2 lines total across 8 files):**

| File | Lines changed | What changed | Merge risk |
|---|---|---|---|
| `proto/anki/scheduler.proto` | +154 | New MCAT RPCs/messages appended to the service/file | Low — pure additions at the end of existing blocks; conflicts only if upstream also appends near the same lines. |
| `proto/anki/frontend.proto` | +17 | Frontend-facing message additions | Low, same reason. |
| `rslib/src/scheduler/service/mod.rs` | +156 | New `BackendSchedulerService` trait method impls (`compute_mcat_readiness` etc.) + `build_mcat_readiness` helper | Low-medium — this file is actively developed upstream (FSRS work lands here too), so line-based conflicts are plausible, but the new code is additive (new fn + new match arms), not a rewrite of existing logic. |
| `rslib/src/backend/mod.rs` | +4/−2 | Wiring for the new RPCs | Low — small, mechanical. |
| `rslib/src/lib.rs` | +1 | `mod mcat;` declaration | Trivial. |
| `rslib/src/scheduler/answering/mod.rs` | +12 | Hook so MCAT leaf state recomputes after a normal answer | Low-medium — touches a hot upstream file; review any upstream diff here closely on merge. |
| `rslib/src/storage/mod.rs` | +1 | Re-export of the new `mcat` storage module | Trivial. |
| `rslib/src/storage/sqlite.rs` | +5 | New MCAT table migration hook | Low — additive schema migration, same pattern upstream uses for its own tables. |

**Bottom line:** no upstream file was rewritten or restructured; every touch
is either a new match arm, a new function, or a new `mod` declaration.
Pulling a future upstream Anki release should mostly conflict (if at all) in
`rslib/src/scheduler/service/mod.rs` and `rslib/src/scheduler/answering/mod.rs`,
since those are the two touched files upstream itself changes most often —
budget review time there first on any merge.

## Undo

`mcat_answer_card`/`mcat_answer_card_typed` route through
`self.transact(Op::AnswerCard, ...)`, the same undo-tracked op boundary Anki's
own answer flow uses — see `rslib/src/mcat/adapter.rs`'s
`answering_an_mcat_card_can_be_undone` test, which proves scheduling, the
revlog row, and the give-up-rule's graded-review counter all roll back
together on `col.undo()`. `mcat_reset_progress` intentionally uses
`transact_no_undo` — it is an explicit, irreversible "start over" action, not
part of the normal review flow.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mcat-rust-change-notes.md
git commit -m "docs(mcat): why-Rust + upstream-footprint + merge-difficulty writeup"
```

---

### Task 8: README states the exam and the give-up rule

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the exam statement**

In `README.md`, insert a new section immediately after the existing `## About` section (after the line `Anki is a spaced repetition program. Please see the [website](https://apps.ankiweb.net) to learn more.` and before `## Getting Started`):

```markdown
## MCAT Speedrun

This fork targets the **MCAT**, scored 472–528 across four sections (each
118–132): Chemical/Physical Foundations, Biological/Biochemical Foundations,
Psychological/Social/Biological Foundations, and CARS. Study progress is
tracked per AAMC blueprint subtopic (34 leaves) and rolled up into a
blueprint-weighted readiness estimate — see `rslib/src/mcat/scoring.rs`.

**Give-up rule:** no readiness score is shown until the student has at least
200 graded MCAT reviews, at least 50% blueprint coverage, and at least one
assessed subtopic in every section. Below that bar the dashboard states
exactly what's missing instead of showing a number.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: state the exam (MCAT) and the give-up rule at the top of the README"
```

---

## Self-Review Notes

- **Spec coverage:** Wednesday's "Rust change working end-to-end" (diff exists, 63 existing unit tests, Task 4 adds the missing Python-callable test), "memory model running with an honest score: a range plus the give-up rule" (Tasks 1–3, 6), "why Rust not Python" + "upstream files touched / merge difficulty" (Task 7), "proof that undo still works" (Task 5), and the exam statement (Task 8) are each covered by a task above. Review loop, mobile build, and the installer already exist and are out of scope here (verification-only, not implementation). Proof artifacts (commit hash, clean-build recording, clean-machine install recording, phone screen recording) are recordings the student captures after these tasks land — not code, so not tasked here.
- **Not in this plan (tracked as follow-on work, do not start until this plan is merged):** the memory-vs-performance conflation (needs a genuinely separate performance/ability model, likely Friday-scoped since mobile's readiness split is a Friday deliverable), mobile two-way sync, AI card generation + evals, the benchmark command, crash/corruption tests, and the paraphrase/leakage/AI-card-check proof scripts (7d/7e/7f/7g).
