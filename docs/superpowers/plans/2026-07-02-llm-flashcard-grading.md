# LLM-Graded Short-Answer Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flashcard self-grading with typed short answers graded by an OpenAI LLM, applied automatically to FSRS and counted as objective evidence for the fluency gate.

**Architecture:** One new protobuf RPC `AnswerMcatCardTyped` declared in `BackendSchedulerService` (implemented on `Backend`, which has the tokio runtime and can do HTTP without holding the collection lock). A new `rslib/src/mcat/grader.rs` holds the pure verdict→grade mapping plus a `reqwest` OpenAI client behind an `AnswerGrader` trait. Graded reviews are persisted to a new `mcat_answer_log` table (keyed by revlog id) written in the same transaction as the card answer; `aggregate.rs` discounts non-verdict-backed (legacy self-graded) correct recalls when computing the gate's spaced-correct evidence. The Svelte StudyPage flashcard branch becomes a typed-answer flow (textarea → grading spinner → verdict chip + feedback → Continue).

**Tech Stack:** Rust (rslib, reqwest, tokio, serde_json, rusqlite), protobuf, Python (aqt glue), Svelte/TypeScript.

**Design spec:** `docs/superpowers/specs/2026-07-02-llm-flashcard-grading-design.md` (approved).

## Global Constraints

- Verdict mapping (spec §2): gave-up/empty/`incorrect` → Again; `partial` → Hard; `correct` → Easy if `ms <= typed_latency().fast` else Good.
- Block-until-graded: NO self-grade fallback anywhere. On failure the card stays unanswered and the UI offers Retry.
- Default model `gpt-5-mini`; override env var `MCAT_GRADER_MODEL`. API key env var `OPENAI_API_KEY`, loaded at startup from `questionbankparsing/.env` (pre-set env vars win). NEVER print or log the key value.
- Retries: 5 attempts, exponential backoff 2s→60s, on connect error/timeout/429/5xx only.
- Build tooling on this machine (see memory `build-tooling-quirks`): `just` is NOT installed; `cargo` is not on PATH. Prepend in PowerShell: `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`. Ninja wrapper: `tools\ninja <targets>`. A running dev Anki locks `_rsbridge.pyd` — close it before `tools\ninja pylib`.
- Rust style: rslib uses `AnkiError`/`Result` from `error/mod.rs` (snafu). Match surrounding comment density/idiom.
- All commits: end message with the Co-Authored-By/Claude-Session trailer used by this session.

## File Structure

- `rslib/src/mcat/grader.rs` (new) — Verdict enum, typed latency, verdict→grade mapping, `AnswerGrader` trait, OpenAI client (request build / response parse / retry loop).
- `rslib/src/mcat/mod.rs` — register `pub mod grader;`.
- `rslib/src/storage/mcat/create.sql` — add `mcat_answer_log` table.
- `rslib/src/storage/mcat/mod.rs` — add/read/clear answer-log rows.
- `rslib/src/mcat/model.rs` — `Review.objective` field + `SELF_GRADED_EVIDENCE_WEIGHT` const.
- `rslib/src/mcat/aggregate.rs` — discount non-objective correct recalls in `spaced_correct`.
- `rslib/src/mcat/adapter.rs` — objective ids + typed latency into `build_card_reviews`; `mcat_flashcard_fields`; `mcat_answer_card_typed`; shared `mcat_apply_grade`; reset clears answer log.
- `proto/anki/scheduler.proto` — request/response messages + RPC in `BackendSchedulerService`.
- `rslib/src/scheduler/service/mod.rs` — `answer_mcat_card_typed` on `Backend`.
- `qt/aqt/mediasrv.py` — expose `answer_mcat_card_typed`.
- `qt/aqt/__init__.py` — `_load_openai_env()` at startup.
- `ts/routes/mcat/study/StudyPage.svelte` — typed-answer flashcard flow.
- `Planning/PRD.md` — grading section + implementation status updates.

---

### Task 1: Verdict model + grade mapping (pure Rust)

**Files:**

- Create: `rslib/src/mcat/grader.rs`
- Modify: `rslib/src/mcat/mod.rs` (add `pub mod grader;` in alphabetical order with the other `pub mod` lines)

**Interfaces:**

- Produces: `Verdict` (`Incorrect`/`Partial`/`Correct`), `typed_latency() -> Latency`, `grade_typed(Verdict, u32) -> Grade`, `GradedAnswer { verdict: Verdict, feedback: String, model: String }`, `gave_up_result() -> GradedAnswer`, `verdict_str(Verdict) -> &'static str`. Tasks 3, 4, 5 consume these.

- [ ] **Step 1: Create `rslib/src/mcat/grader.rs` with types + failing-to-exist tests**

```rust
// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! LLM grading of typed flashcard answers: the pure verdict -> FSRS grade
//! mapping, plus the OpenAI HTTP client used by the AnswerMcatCardTyped RPC
//! (added in a later task).

use super::model::Grade;
use super::model::Latency;

/// LLM judgment of a typed answer against the card's canonical description.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Incorrect,
    Partial,
    Correct,
}

/// The verdict as stored in `mcat_answer_log`.
pub fn verdict_str(v: Verdict) -> &'static str {
    match v {
        Verdict::Incorrect => "incorrect",
        Verdict::Partial => "partial",
        Verdict::Correct => "correct",
    }
}

/// A graded typed answer. `model` is empty for the gave-up path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GradedAnswer {
    pub verdict: Verdict,
    pub feedback: String,
    pub model: String,
}

/// The result recorded for an "I don't know" / empty submission: objectively
/// wrong, no LLM call needed.
pub fn gave_up_result() -> GradedAnswer {
    GradedAnswer {
        verdict: Verdict::Incorrect,
        feedback: String::new(),
        model: String::new(),
    }
}

/// Typed-mode latency thresholds (ms). Typing an answer is much slower than
/// pressing a grade button, so these are wider than
/// `latency_for(ItemKind::Flashcard)`. PLACEHOLDER calibration, like the other
/// per-type thresholds (see PRD).
pub fn typed_latency() -> Latency {
    Latency {
        fast: 20_000,
        slow: 45_000,
    }
}

/// Map an LLM verdict + response time to the FSRS grade (design spec §2):
/// correctness decides pass/fail, speed modulates only full-credit answers.
pub fn grade_typed(verdict: Verdict, ms: u32) -> Grade {
    match verdict {
        Verdict::Incorrect => Grade::Again,
        Verdict::Partial => Grade::Hard,
        Verdict::Correct => {
            if ms <= typed_latency().fast {
                Grade::Easy
            } else {
                Grade::Good
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdict_maps_to_grade_with_speed_modulation() {
        let fast = typed_latency().fast;
        assert_eq!(grade_typed(Verdict::Incorrect, 1_000), Grade::Again);
        assert_eq!(grade_typed(Verdict::Incorrect, 100_000), Grade::Again);
        assert_eq!(grade_typed(Verdict::Partial, 1_000), Grade::Hard);
        assert_eq!(grade_typed(Verdict::Correct, fast), Grade::Easy);
        assert_eq!(grade_typed(Verdict::Correct, fast + 1), Grade::Good);
        assert_eq!(grade_typed(Verdict::Correct, 200_000), Grade::Good);
    }

    #[test]
    fn gave_up_is_incorrect_with_no_feedback() {
        let g = gave_up_result();
        assert_eq!(g.verdict, Verdict::Incorrect);
        assert!(g.feedback.is_empty());
        assert!(g.model.is_empty());
    }

    #[test]
    fn verdict_strings_match_storage_format() {
        assert_eq!(verdict_str(Verdict::Correct), "correct");
        assert_eq!(verdict_str(Verdict::Partial), "partial");
        assert_eq!(verdict_str(Verdict::Incorrect), "incorrect");
    }
}
```

- [ ] **Step 2: Register the module** — in `rslib/src/mcat/mod.rs`, add `pub mod grader;` alphabetically among the existing `pub mod` declarations.

- [ ] **Step 3: Run the tests**

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test -p anki mcat::grader
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```powershell
git add rslib/src/mcat/grader.rs rslib/src/mcat/mod.rs
git commit -m "feat(mcat): verdict model + typed-answer grade mapping"
```

---

### Task 2: `mcat_answer_log` storage

**Files:**

- Modify: `rslib/src/storage/mcat/create.sql`
- Modify: `rslib/src/storage/mcat/mod.rs`

**Interfaces:**

- Produces: `SqliteStorage::add_mcat_answer_log(revlog_id: i64, card_id: i64, verdict: &str, typed_answer: &str, feedback: &str, model: &str) -> Result<()>`, `SqliteStorage::mcat_answer_log_ids_for_card(card_id: i64) -> Result<HashSet<i64>>`, `SqliteStorage::clear_mcat_answer_log() -> Result<()>`. Tasks 3 and 5 consume these.
- Consumes: existing `create_mcat_tables` (already called from `sqlite.rs` `open_or_create` — the new table rides the same `execute_batch`, no new hook needed).

- [ ] **Step 1: Append the table to `rslib/src/storage/mcat/create.sql`**

```sql
CREATE TABLE IF NOT EXISTS mcat_answer_log (
  revlog_id INTEGER NOT NULL PRIMARY KEY,
  card_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  typed_answer TEXT NOT NULL,
  feedback TEXT NOT NULL,
  model TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcat_answer_log_card ON mcat_answer_log (card_id);
```

(Keep the existing `mcat_leaf_state` statement above it; the file is run with `execute_batch`, so multiple statements are fine.)

- [ ] **Step 2: Add storage methods + failing test to `rslib/src/storage/mcat/mod.rs`**

Add `use std::collections::HashSet;` to the imports, then inside `impl SqliteStorage`:

```rust
    /// Record one LLM/objectively-graded typed answer, linked to the revlog
    /// row it graded. `insert or replace` keeps re-answers idempotent.
    pub(crate) fn add_mcat_answer_log(
        &self,
        revlog_id: i64,
        card_id: i64,
        verdict: &str,
        typed_answer: &str,
        feedback: &str,
        model: &str,
    ) -> Result<()> {
        self.db
            .prepare_cached(
                "insert or replace into mcat_answer_log \
                 (revlog_id, card_id, verdict, typed_answer, feedback, model) \
                 values (?, ?, ?, ?, ?, ?)",
            )?
            .execute(params![
                revlog_id,
                card_id,
                verdict,
                typed_answer,
                feedback,
                model
            ])?;
        Ok(())
    }

    /// Revlog ids of this card's verdict-backed (objectively graded) reviews.
    pub(crate) fn mcat_answer_log_ids_for_card(&self, card_id: i64) -> Result<HashSet<i64>> {
        self.db
            .prepare_cached("select revlog_id from mcat_answer_log where card_id = ?")?
            .query_map([card_id], |r| r.get(0))?
            .collect::<std::result::Result<HashSet<i64>, _>>()
            .map_err(Into::into)
    }

    /// Delete every answer-log row (used by the full progress reset).
    pub(crate) fn clear_mcat_answer_log(&self) -> Result<()> {
        self.db.execute("delete from mcat_answer_log", [])?;
        Ok(())
    }
```

And at the bottom of the file:

```rust
#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use crate::collection::Collection;

    #[test]
    fn answer_log_roundtrip() {
        let col = Collection::new();
        col.storage
            .add_mcat_answer_log(123, 7, "partial", "my answer", "missed X", "gpt-5-mini")
            .unwrap();
        col.storage
            .add_mcat_answer_log(456, 7, "correct", "", "", "")
            .unwrap();
        col.storage
            .add_mcat_answer_log(789, 8, "incorrect", "", "", "")
            .unwrap();
        assert_eq!(
            col.storage.mcat_answer_log_ids_for_card(7).unwrap(),
            HashSet::from([123, 456])
        );
        // idempotent on the same revlog row
        col.storage
            .add_mcat_answer_log(123, 7, "correct", "edited", "", "gpt-5-mini")
            .unwrap();
        assert_eq!(
            col.storage.mcat_answer_log_ids_for_card(7).unwrap().len(),
            2
        );
        col.storage.clear_mcat_answer_log().unwrap();
        assert!(col
            .storage
            .mcat_answer_log_ids_for_card(7)
            .unwrap()
            .is_empty());
    }
}
```

- [ ] **Step 3: Run**

```powershell
cargo test -p anki mcat::answer_log
```

Expected: `answer_log_roundtrip` passes (the `storage::mcat::tests` filter also works: `cargo test -p anki storage::mcat`).

- [ ] **Step 4: Commit**

```powershell
git add rslib/src/storage/mcat/create.sql rslib/src/storage/mcat/mod.rs
git commit -m "feat(mcat): mcat_answer_log table for verdict-backed reviews"
```

---

### Task 3: Objective evidence in the scoring layer

**Files:**

- Modify: `rslib/src/mcat/model.rs` (Review field + const)
- Modify: `rslib/src/mcat/aggregate.rs` (spaced_correct weighting + tests)
- Modify: `rslib/src/mcat/adapter.rs` (`build_card_reviews` signature, `mcat_leaf_inputs`, `mcat_reset_progress`)

**Interfaces:**

- Consumes: Task 1 `typed_latency()`; Task 2 `mcat_answer_log_ids_for_card`, `clear_mcat_answer_log`.
- Produces: `Review.objective: bool`; `SELF_GRADED_EVIDENCE_WEIGHT: f32 = 0.5` in `model.rs`. `build_card_reviews(entries, kind, is_app, cars, latency, objective_ids: &HashSet<i64>)`.

- [ ] **Step 1: Add the field + constant to `rslib/src/mcat/model.rs`**

In `struct Review`, after the `latency` field:

```rust
/// Correctness is verdict-backed (LLM-graded typed answer, or an
/// auto-graded MCQ) rather than a self-pressed grade button.
pub objective: bool,
```

With the other calibration constants (after `SPACED_CORRECT_TARGET`):

```rust
// objective grading (LLM-verdict-backed reviews vs legacy self-graded ones)
pub const SELF_GRADED_EVIDENCE_WEIGHT: f32 = 0.5; // discount for self-graded correct recalls
```

- [ ] **Step 2: Write the failing aggregate test**

In `rslib/src/mcat/aggregate.rs` tests: first make the two helpers construct objective reviews (the new normal). In `rote_review` and `app_review`, add `objective: true,` to the `Review { ... }` literal (next to `productive_failure`). Then add:

```rust
#[test]
fn self_graded_evidence_is_discounted_for_the_gate() {
    // the same spaced fast-correct history that opens the gate when
    // verdict-backed (see massed_cramming test) is only half evidence
    // when it came from self-pressed grade buttons
    let l = leaf("1A").unwrap();
    let rote_mem = vec![RoteMemory {
        retrievability_now: 0.95,
        reps: 5,
    }];
    let mut self_rated = vec![
        rote_review(20, true, 3_000, false),
        rote_review(10, true, 3_000, false),
        rote_review(5, true, 3_000, false),
    ];
    for r in &mut self_rated {
        r.objective = false;
    }
    let s = score_leaf(&l, &self_rated, &rote_mem, NOW);
    assert!(!s.gate_open, "self-graded clicks alone opened the fluency gate");
}
```

- [ ] **Step 3: Run to verify it fails**

```powershell
cargo test -p anki mcat::aggregate
```

Expected: FAIL — `self_graded_evidence_is_discounted_for_the_gate` panics ("self-graded clicks alone opened the fluency gate") because spaced_correct still counts them fully. (If it fails to compile first, that's the missing-field errors — fix the two helpers per Step 2, not the production code.)

- [ ] **Step 4: Implement the discount in `aggregate.rs`**

Replace the `spaced_correct` computation in `score_leaf`:

```rust
// effective spaced-correct: sum of spacing weights over correct recalls.
// Verdict-backed (objective) recalls count fully; legacy self-graded ones
// are discounted — an "Easy" click is weak evidence (PRD: Hendrick).
let spaced_correct: f32 = rote_reviews
    .iter()
    .zip(&rote_spacing)
    .filter(|(r, _)| r.correct)
    .map(|(r, &w)| {
        w * if r.objective {
            1.0
        } else {
            SELF_GRADED_EVIDENCE_WEIGHT
        }
    })
    .sum();
```

- [ ] **Step 5: Wire objectivity through the adapter**

In `rslib/src/mcat/adapter.rs`:

a. Add `use std::collections::HashSet;` next to the existing `use std::collections::HashMap;`.

b. Change `build_card_reviews` to accept and use the log ids (full replacement of the signature and the loop body's Review construction):

```rust
fn build_card_reviews(
    entries: &[RevlogEntry],
    kind: ItemKind,
    is_app: bool,
    cars: bool,
    latency: Latency,
    objective_ids: &HashSet<i64>,
) -> Vec<Review> {
```

and inside the loop, just before `out.push(...)`:

```rust
// MCQ answers are always auto-graded; a flashcard row is objective
// when a verdict-backed answer-log entry points at it. Typed answers
// are judged against the wider typed-mode thresholds.
let objective = is_app || objective_ids.contains(&ts);
let latency = if !is_app && objective_ids.contains(&ts) {
    super::grader::typed_latency()
} else {
    latency
};
```

and add `objective,` to the `Review { ... }` literal.

c. In `mcat_leaf_inputs`, fetch the ids and pass them:

```rust
let entries = self.storage.get_revlog_entries_for_card(cid)?;
let objective_ids = self.storage.mcat_answer_log_ids_for_card(cid.0)?;
let card_reviews =
    build_card_reviews(&entries, kind, is_app, cars, latency, &objective_ids);
```

d. In `mcat_reset_progress`, clear the log alongside the revlog:

```rust
self.transact_no_undo(|col| {
    col.storage.clear_revlog_for_cards(&ids)?;
    col.storage.clear_mcat_answer_log()?;
    col.storage.clear_mcat_leaf_states()
})?;
```

- [ ] **Step 6: Run the full mcat test module**

```powershell
cargo test -p anki mcat
```

Expected: all pass, including the pre-existing `massed_cramming_does_not_open_gate_but_spaced_recalls_do` (its spaced recalls are now objective via the helper) and the new discount test.

- [ ] **Step 7: Commit**

```powershell
git add rslib/src/mcat/model.rs rslib/src/mcat/aggregate.rs rslib/src/mcat/adapter.rs
git commit -m "feat(mcat): verdict-backed reviews count as objective gate evidence"
```

---

### Task 4: OpenAI grader client

**Files:**

- Modify: `rslib/src/mcat/grader.rs`

**Interfaces:**

- Produces: `trait AnswerGrader { fn grade_answer(&self, term: &str, expected: &str, typed: &str) -> Result<GradedAnswer>; }` and `OpenAiGrader::new(client: reqwest::Client, runtime: tokio::runtime::Handle) -> OpenAiGrader`. Task 5 consumes both.
- Consumes: `Backend::web_client()` / `Backend::runtime_handle()` (existing, `rslib/src/backend/mod.rs:129,175`).

- [ ] **Step 1: Add failing unit tests for request building + response parsing**

Append to the `tests` module in `grader.rs`:

```rust
    #[test]
    fn request_body_shape() {
        let b = request_body("gpt-5-mini", "Glycolysis", "splits glucose", "my answer");
        assert_eq!(b["model"], "gpt-5-mini");
        // gpt-5 family: keep grading snappy
        assert_eq!(b["reasoning_effort"], "minimal");
        let user = b["messages"][1]["content"].as_str().unwrap();
        assert!(user.contains("Glycolysis"));
        assert!(user.contains("splits glucose"));
        assert!(user.contains("my answer"));
        assert_eq!(b["response_format"]["type"], "json_schema");
        // non-reasoning models must not get the parameter
        let b = request_body("gpt-4o-mini", "t", "e", "a");
        assert!(b.get("reasoning_effort").is_none());
    }

    #[test]
    fn parses_chat_completion_response() {
        let body = r#"{"choices":[{"message":{"content":"{\"verdict\":\"partial\",\"feedback\":\"Missed the ATP yield.\"}"}}]}"#;
        let g = parse_response("gpt-5-mini", body).unwrap();
        assert_eq!(g.verdict, Verdict::Partial);
        assert_eq!(g.feedback, "Missed the ATP yield.");
        assert_eq!(g.model, "gpt-5-mini");
    }

    #[test]
    fn unknown_verdict_reads_as_incorrect() {
        let body = r#"{"choices":[{"message":{"content":"{\"verdict\":\"garbled\",\"feedback\":\"\"}"}}]}"#;
        assert_eq!(
            parse_response("m", body).unwrap().verdict,
            Verdict::Incorrect
        );
    }
```

- [ ] **Step 2: Run to verify failure**

```powershell
cargo test -p anki mcat::grader
```

Expected: compile FAIL — `request_body` / `parse_response` not found.

- [ ] **Step 3: Implement the client**

Add to `grader.rs` (below the pure functions). Imports to add at the top: `use std::time::Duration;`, `use serde::Deserialize;`, `use crate::error::NetworkError;`, `use crate::error::NetworkErrorKind;`, `use crate::prelude::*;`.

```rust
const DEFAULT_MODEL: &str = "gpt-5-mini";
const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";
const MAX_ATTEMPTS: u32 = 5;
const REQUEST_TIMEOUT_SECS: u64 = 60;

/// Grades a typed answer against the card's canonical description. Trait so
/// the answer flow can be tested without the network.
pub trait AnswerGrader {
    fn grade_answer(&self, term: &str, expected: &str, typed: &str) -> Result<GradedAnswer>;
}

pub struct OpenAiGrader {
    client: reqwest::Client,
    runtime: tokio::runtime::Handle,
}

impl OpenAiGrader {
    pub fn new(client: reqwest::Client, runtime: tokio::runtime::Handle) -> OpenAiGrader {
        OpenAiGrader { client, runtime }
    }
}

impl AnswerGrader for OpenAiGrader {
    fn grade_answer(&self, term: &str, expected: &str, typed: &str) -> Result<GradedAnswer> {
        let key = api_key()?;
        let model = grader_model();
        let body = request_body(&model, term, expected, typed);
        self.runtime
            .block_on(grade_with_retries(&self.client, &key, &model, &body))
    }
}

fn api_key() -> Result<String> {
    match std::env::var("OPENAI_API_KEY") {
        Ok(k) if !k.trim().is_empty() => Ok(k),
        _ => invalid_input!(
            "OPENAI_API_KEY is not set; add it to questionbankparsing/.env or the environment"
        ),
    }
}

fn grader_model() -> String {
    std::env::var("MCAT_GRADER_MODEL")
        .ok()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

/// Chat-completions payload with a strict JSON schema so the reply is always
/// `{verdict, feedback}`.
fn request_body(model: &str, term: &str, expected: &str, typed: &str) -> serde_json::Value {
    let system = "You grade a student's short-answer description of an MCAT term \
against the canonical description from their flashcard. Grade MEANING, not wording: \
synonyms and paraphrases are fine, but the answer must contain the key discriminating \
facts of the canonical description. verdict: \"correct\" when the key facts are all \
present, \"partial\" when some are, \"incorrect\" when the answer is wrong, vacuous, \
or off-topic. feedback: one short sentence naming what was missing or wrong (empty \
string when fully correct).";
    let user = format!("Term: {term}\n\nCanonical description: {expected}\n\nStudent's answer: {typed}");
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "grade",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "verdict": {"type": "string", "enum": ["correct", "partial", "incorrect"]},
                        "feedback": {"type": "string"}
                    },
                    "required": ["verdict", "feedback"],
                    "additionalProperties": false
                }
            }
        }
    });
    if model.starts_with("gpt-5") {
        // reasoning models default to a slower effort; grading is simple
        body["reasoning_effort"] = serde_json::json!("minimal");
    }
    body
}

fn parse_response(model: &str, body: &str) -> Result<GradedAnswer> {
    #[derive(Deserialize)]
    struct Msg {
        content: String,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: Msg,
    }
    #[derive(Deserialize)]
    struct Resp {
        choices: Vec<Choice>,
    }
    #[derive(Deserialize)]
    struct GraderJson {
        verdict: String,
        feedback: String,
    }

    let resp: Resp = serde_json::from_str(body)?;
    let content = resp
        .choices
        .first()
        .map(|c| c.message.content.as_str())
        .unwrap_or_default();
    let parsed: GraderJson = serde_json::from_str(content)?;
    let verdict = match parsed.verdict.as_str() {
        "correct" => Verdict::Correct,
        "partial" => Verdict::Partial,
        _ => Verdict::Incorrect,
    };
    Ok(GradedAnswer {
        verdict,
        feedback: parsed.feedback,
        model: model.to_string(),
    })
}

/// Block-until-graded policy: retry transient failures (connect/timeout/429/
/// 5xx) with exponential backoff; anything else fails immediately and the
/// card is left unanswered for the UI to retry.
async fn grade_with_retries(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    body: &serde_json::Value,
) -> Result<GradedAnswer> {
    let mut delay = 2u64;
    let mut last_err = String::new();
    for attempt in 0..MAX_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(delay)).await;
            delay = (delay * 2).min(60);
        }
        match client
            .post(OPENAI_URL)
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .bearer_auth(key)
            .json(body)
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    return parse_response(model, &text);
                }
                let retryable = status.as_u16() == 429 || status.is_server_error();
                if !retryable {
                    return Err(network_error(format!("OpenAI HTTP {status}: {text}")));
                }
                last_err = format!("HTTP {status}");
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(network_error(format!(
        "LLM grading failed after {MAX_ATTEMPTS} attempts: {last_err}"
    )))
}

fn network_error(info: String) -> AnkiError {
    AnkiError::NetworkError {
        source: NetworkError {
            info,
            kind: NetworkErrorKind::Other,
        },
    }
}
```

- [ ] **Step 4: Add the env-gated live smoke test** (bottom of the `tests` module):

```rust
    /// Loads questionbankparsing/.env so the ignored live test can run
    /// without exporting the key manually. Pre-set env vars win.
    fn load_dotenv_for_test() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../questionbankparsing/.env");
        if let Ok(text) = std::fs::read_to_string(path) {
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    let (k, v) = (k.trim(), v.trim().trim_matches('"').trim_matches('\''));
                    if !k.is_empty() && std::env::var(k).is_err() {
                        std::env::set_var(k, v);
                    }
                }
            }
        }
    }

    #[test]
    #[ignore = "live OpenAI call; run: cargo test -p anki grader -- --ignored"]
    fn live_grading_smoke() {
        load_dotenv_for_test();
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .unwrap();
        let grader = OpenAiGrader::new(reqwest::Client::new(), rt.handle().clone());
        let g = grader
            .grade_answer(
                "Glycolysis",
                "The metabolic pathway that splits glucose into two pyruvate molecules, \
                 producing a net 2 ATP and 2 NADH.",
                "it splits glucose into pyruvate and makes some ATP",
            )
            .unwrap();
        assert_ne!(g.verdict, Verdict::Incorrect);
        assert!(!g.model.is_empty());
    }
```

- [ ] **Step 5: Run**

```powershell
cargo test -p anki mcat::grader
```

Expected: 6 passed, 1 ignored. Then run the live smoke once (needs network + key):

```powershell
cargo test -p anki grader -- --ignored --nocapture
```

Expected: `live_grading_smoke ... ok`. If it fails with an HTTP 400 mentioning `reasoning_effort` or `response_format`, adjust `request_body` for the actual model family and re-run (document what changed in the commit message).

- [ ] **Step 6: Commit**

```powershell
git add rslib/src/mcat/grader.rs
git commit -m "feat(mcat): OpenAI structured-output grader with retry policy"
```

---

### Task 5: Proto RPC + backend service + answer path

**Files:**

- Modify: `proto/anki/scheduler.proto`
- Modify: `rslib/src/mcat/adapter.rs`
- Modify: `rslib/src/scheduler/service/mod.rs`

**Interfaces:**

- Consumes: Task 1 (`grade_typed`, `gave_up_result`, `verdict_str`, `GradedAnswer`, `Verdict`), Task 2 (`add_mcat_answer_log`), Task 4 (`OpenAiGrader`, `AnswerGrader`), `Backend::{with_col, web_client, runtime_handle}`.
- Produces: RPC `AnswerMcatCardTyped(AnswerMcatCardTypedRequest) -> AnswerMcatCardTypedResponse`; `Collection::mcat_flashcard_fields(CardId) -> Result<(String, String)>`; `Collection::mcat_answer_card_typed(CardId, u32, &GradedAnswer, &str) -> Result<Grade>`. Tasks 6-7 consume the RPC.

- [ ] **Step 1: Proto messages** — in `proto/anki/scheduler.proto`, after `AnswerMcatCardResponse` (line ~594):

```proto
message AnswerMcatCardTypedRequest {
  int64 card_id = 1;
  // The learner's typed description of the term.
  string typed_answer = 2;
  // Time from card shown to submit, in ms (the grading wait is excluded).
  uint32 milliseconds_taken = 3;
  // True for "I don't know": no LLM call; graded Again.
  bool gave_up = 4;
}

message AnswerMcatCardTypedResponse {
  enum Verdict {
    INCORRECT = 0;
    PARTIAL = 1;
    CORRECT = 2;
  }
  Verdict verdict = 1;
  // One-line LLM note on what was missing/wrong (empty when fully correct or
  // gave up).
  string feedback = 2;
  // The FSRS grade applied (1=Again 2=Hard 3=Good 4=Easy).
  uint32 grade = 3;
}
```

- [ ] **Step 2: Proto RPC** — add to `service BackendSchedulerService` (NOT `SchedulerService`; the backend has the tokio runtime and must not hold the collection lock during HTTP), after `ExportDataset`:

```proto
// Grade a typed MCAT flashcard answer with the LLM, then answer the card:
// one atomic step from the client's perspective. Blocks until grading
// succeeds or retries are exhausted; on failure the card is left
// unanswered so the client can retry the same submission.
rpc AnswerMcatCardTyped(AnswerMcatCardTypedRequest)
    returns (AnswerMcatCardTypedResponse);
```

- [ ] **Step 3: Adapter — extract the shared answer helper.** In `rslib/src/mcat/adapter.rs`, add this free function (near `media_url`), then rewrite `mcat_answer_card`'s `transact` block to use it:

```rust
/// Apply an FSRS grade to a card inside the ambient transaction: pick the
/// scheduling state matching `grade` and run the normal answer flow (revlog
/// row with taken millis, leaf-state hook).
fn mcat_apply_grade(
    col: &mut Collection,
    card_id: CardId,
    grade: Grade,
    milliseconds_taken: u32,
) -> Result<()> {
    let states = col.get_scheduling_states(card_id)?;
    let new_state = match grade {
        Grade::Again => states.again,
        Grade::Hard => states.hard,
        Grade::Good => states.good,
        Grade::Easy => states.easy,
    };
    let mut answer: crate::scheduler::answering::CardAnswer = anki_proto::scheduler::CardAnswer {
        card_id: card_id.into(),
        current_state: Some(states.current.into()),
        new_state: Some(new_state.into()),
        rating: grade.as_u8() as i32 - 1,
        milliseconds_taken,
        answered_at_millis: TimestampMillis::now().into(),
    }
    .into();
    answer.from_queue = false;
    col.answer_card_inner(&mut answer)
}
```

`mcat_answer_card`'s transact block becomes:

```rust
self.transact(crate::ops::Op::AnswerCard, |col| {
    mcat_apply_grade(col, card_id, grade, milliseconds_taken)
})?;
```

- [ ] **Step 4: Adapter — new methods.** Inside `impl Collection` in `adapter.rs` (imports: add `use super::grader::grade_typed;`, `use super::grader::verdict_str;`, `use super::grader::GradedAnswer;`):

```rust
    /// Term + canonical description of a rote flashcard, for the LLM grader.
    pub(crate) fn mcat_flashcard_fields(&mut self, card_id: CardId) -> Result<(String, String)> {
        let card = self.storage.get_card(card_id)?.or_not_found(card_id)?;
        let note = self
            .storage
            .get_note(card.note_id)?
            .or_not_found(card.note_id)?;
        let nt = self
            .get_notetype(note.notetype_id)?
            .or_not_found(note.notetype_id)?;
        let field = |names: &[&str]| -> String {
            for (idx, f) in nt.fields.iter().enumerate() {
                if names.iter().any(|n| f.name.eq_ignore_ascii_case(n)) {
                    return note.fields().get(idx).cloned().unwrap_or_default();
                }
            }
            String::new()
        };
        let fields = note.fields();
        Ok((
            non_empty_or(field(&["Front", "Question"]), fields.first()),
            non_empty_or(field(&["Back", "Answer"]), fields.get(1)),
        ))
    }

    /// Answer a flashcard from a graded typed answer: map the verdict to the
    /// FSRS grade, run the normal answer flow, and persist the verdict-backed
    /// answer-log row — all in one transaction, so a crash never half-applies
    /// a review.
    pub(crate) fn mcat_answer_card_typed(
        &mut self,
        card_id: CardId,
        milliseconds_taken: u32,
        graded: &GradedAnswer,
        typed_answer: &str,
    ) -> Result<Grade> {
        let grade = grade_typed(graded.verdict, milliseconds_taken);
        self.transact(crate::ops::Op::AnswerCard, |col| {
            mcat_apply_grade(col, card_id, grade, milliseconds_taken)?;
            // answer_card_inner just appended this card's newest revlog row;
            // link the log entry to it so recompute can prove objectivity
            let revlog_id = col
                .storage
                .get_revlog_entries_for_card(card_id)?
                .iter()
                .map(|e| e.id.0)
                .max()
                .or_invalid("revlog row missing after answer")?;
            col.storage.add_mcat_answer_log(
                revlog_id,
                card_id.0,
                verdict_str(graded.verdict),
                typed_answer,
                &graded.feedback,
                &graded.model,
            )
        })?;
        Ok(grade)
    }
```

- [ ] **Step 5: Adapter test** (in `adapter.rs`'s existing `tests` module; add imports `use crate::tests::NoteAdder;` and `use super::super::grader::GradedAnswer;` / `use super::super::grader::Verdict;` as needed):

```rust
    #[test]
    fn typed_answer_writes_revlog_and_answer_log() {
        let mut col = Collection::new();
        let mut note = NoteAdder::basic(&mut col)
            .fields(&["Glycolysis", "Splits glucose into two pyruvate; net 2 ATP + 2 NADH"])
            .add(&mut col);
        note.tags.push("mcat::cc::1D".into());
        col.update_note(&mut note).unwrap();
        let card = col.get_first_card();

        let graded = GradedAnswer {
            verdict: Verdict::Partial,
            feedback: "Missed the ATP yield.".into(),
            model: "test-model".into(),
        };
        let grade = col
            .mcat_answer_card_typed(card.id, 21_000, &graded, "splits glucose")
            .unwrap();
        assert_eq!(grade, Grade::Hard);

        let entries = col.storage.get_revlog_entries_for_card(card.id).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].button_chosen, 2);
        assert_eq!(entries[0].taken_millis, 21_000);
        let ids = col
            .storage
            .mcat_answer_log_ids_for_card(card.id.0)
            .unwrap();
        assert!(ids.contains(&entries[0].id.0));
    }
```

Run: `cargo test -p anki mcat::adapter` — expected: passes (with the earlier tests).

- [ ] **Step 6: Service impl.** In `rslib/src/scheduler/service/mod.rs`, inside `impl crate::services::BackendSchedulerService for Backend` (after `export_dataset`); add imports at the top of the file: `use crate::mcat::grader::gave_up_result;`, `use crate::mcat::grader::AnswerGrader;`, `use crate::mcat::grader::OpenAiGrader;`, `use crate::mcat::grader::Verdict;`.

```rust
fn answer_mcat_card_typed(
    &self,
    input: scheduler::AnswerMcatCardTypedRequest,
) -> Result<scheduler::AnswerMcatCardTypedResponse> {
    let card_id = CardId(input.card_id);
    let gave_up = input.gave_up || input.typed_answer.trim().is_empty();
    // Read the term + canonical description up front so the collection
    // lock is not held during the (retried, possibly slow) HTTP call.
    let (front, back) = self.with_col(|col| col.mcat_flashcard_fields(card_id))?;
    let graded = if gave_up {
        gave_up_result()
    } else {
        OpenAiGrader::new(self.web_client(), self.runtime_handle()).grade_answer(
            &front,
            &back,
            &input.typed_answer,
        )?
    };
    let grade = self.with_col(|col| {
        col.mcat_answer_card_typed(
            card_id,
            input.milliseconds_taken,
            &graded,
            &input.typed_answer,
        )
    })?;
    Ok(scheduler::AnswerMcatCardTypedResponse {
        verdict: match graded.verdict {
            Verdict::Incorrect => {
                scheduler::answer_mcat_card_typed_response::Verdict::Incorrect
            }
            Verdict::Partial => scheduler::answer_mcat_card_typed_response::Verdict::Partial,
            Verdict::Correct => scheduler::answer_mcat_card_typed_response::Verdict::Correct,
        } as i32,
        feedback: graded.feedback,
        grade: grade.as_u8() as u32,
    })
}
```

Note: `web_client()` and `runtime_handle()` are private to the backend module — check their visibility in `rslib/src/backend/mod.rs`; if they are `fn` (private) rather than `pub(crate) fn`, widen them to `pub(crate)` (matching `with_col`).

- [ ] **Step 7: Compile + full Rust tests**

```powershell
cargo check -p anki
cargo test -p anki mcat
```

Expected: clean check (proto codegen runs in build.rs, so the new trait method must be implemented — a missing-method error here means the impl block or proto is wrong); all mcat tests pass.

- [ ] **Step 8: Commit**

```powershell
git add proto/anki/scheduler.proto rslib/src/mcat/adapter.rs rslib/src/scheduler/service/mod.rs rslib/src/backend/mod.rs
git commit -m "feat(mcat): AnswerMcatCardTyped RPC — LLM-graded typed flashcard answers"
```

---

### Task 6: Python glue — .env loading + mediasrv exposure

**Files:**

- Modify: `qt/aqt/__init__.py`
- Modify: `qt/aqt/mediasrv.py:766-772` (the MCAT block of `exposed_backend_list`)

**Interfaces:**

- Consumes: Task 5's backend method (generated as `RustBackend.answer_mcat_card_typed_raw` once pylib is rebuilt).
- Produces: webview-reachable `answerMcatCardTyped` endpoint; `OPENAI_API_KEY`/`MCAT_GRADER_MODEL` in the process env for rslib.

- [ ] **Step 1: Add the loader to `qt/aqt/__init__.py`** — define just above `def run() -> None:`:

```python
def _load_openai_env() -> None:
    """Expose questionbankparsing/.env (OPENAI_API_KEY etc.) to rslib.

    aqt and rslib share one process, so os.environ is visible to Rust's
    std::env. Dev-tree only: silently a no-op when the file is absent
    (packaged builds). Pre-set environment variables always win.
    """
    import os
    from pathlib import Path

    try:
        env_path = Path(__file__).resolve().parents[2] / "questionbankparsing" / ".env"
        if not env_path.exists():
            return
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        return
```

Then make the first statement of `_run()` (immediately after its docstring, `qt/aqt/__init__.py:582`) a call to `_load_openai_env()`.

- [ ] **Step 2: Expose the RPC** — in `qt/aqt/mediasrv.py`, add to the MCAT block of `exposed_backend_list` (after `"answer_mcat_card"`):

```python
"answer_mcat_card_typed",
```

- [ ] **Step 3: Lint the Python**

```powershell
tools\ninja check:mypy check:ruff
```

Expected: clean. (If those target names don't exist, run `tools\ninja check` and read the failing edges — the justfile's `lint` recipe maps to the same checks.) Note: `mediasrv.py` asserts `hasattr(RustBackend, "answer_mcat_card_typed_raw")` at startup, which requires the rebuilt pylib from Task 8 — the assert only runs when Anki launches, not during lint.

- [ ] **Step 4: Commit**

```powershell
git add qt/aqt/__init__.py qt/aqt/mediasrv.py
git commit -m "feat(mcat): expose typed-answer RPC + load OpenAI env at startup"
```

---

### Task 7: Frontend — typed-answer flashcard flow

**Files:**

- Modify: `ts/routes/mcat/study/StudyPage.svelte`

**Interfaces:**

- Consumes: `answerMcatCardTyped` from `@generated/backend`; `AnswerMcatCardTypedResponse_Verdict` from `@generated/anki/scheduler_pb` (both appear after the ninja build regenerates the TS bindings).
- Produces: the user-facing flow. MCQ path untouched.

- [ ] **Step 1: Regenerate TS bindings** (proto changed in Task 5):

```powershell
tools\ninja check:svelte
```

Expected: build regenerates `out/ts/lib/generated/*`; typecheck passes on the unmodified tree. If new rust files aren't picked up by the build, delete `out\build.ninja` and rerun (per PRD build note).

- [ ] **Step 2: Script changes in `StudyPage.svelte`:**

a. Imports — extend the two generated imports:

```ts
import {
    AnswerMcatCardTypedResponse_Verdict,
    McatStudyItem_Kind,
} from "@generated/anki/scheduler_pb";
import { answerMcatCard, answerMcatCardTyped } from "@generated/backend";
```

(keep the existing `import type { McatStudyItem }` line).

b. Replace the state block `let revealed = false;` with the typed-flow state (delete `revealed` everywhere):

```ts
type FlashPhase = "prompt" | "grading" | "graded" | "error";
let flashPhase: FlashPhase = "prompt";
let typedAnswer = "";
let verdict: AnswerMcatCardTypedResponse_Verdict =
    AnswerMcatCardTypedResponse_Verdict.INCORRECT;
let feedback = "";
let gaveUp = false;
let gradeError = "";
let submittedMs = 0;
```

c. Delete the whole `rate()` function; add in its place:

```ts
// Submit the typed answer (or give up) for LLM grading. Blocks until a
// verdict arrives — on failure the card stays unanswered and the same
// submission can be retried (block-until-graded, no self-grade fallback).
async function submitTyped(giveUp: boolean): Promise<void> {
    if (!item || flashPhase === "grading" || flashPhase === "graded") {
        return;
    }
    if (flashPhase === "prompt") {
        // freeze latency at first submit; retries reuse it
        submittedMs = elapsedMs();
    }
    gaveUp = giveUp || typedAnswer.trim().length === 0;
    flashPhase = "grading";
    gradeError = "";
    try {
        const resp = await answerMcatCardTyped({
            cardId: item.cardId,
            typedAnswer,
            millisecondsTaken: submittedMs,
            gaveUp,
        });
        verdict = resp.verdict;
        feedback = resp.feedback;
        flashPhase = "graded";
        fire(
            (["rate-again", "rate-hard", "rate-good", "rate-easy"] as const)[
                resp.grade - 1
            ],
        );
    } catch (err) {
        flashPhase = "error";
        gradeError = err instanceof Error ? err.message : String(err);
    }
}

function onAnswerKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitTyped(false);
    } else if (e.key === "Escape") {
        e.preventDefault();
        submitTyped(true);
    }
}
```

d. `next()` — replace `revealed = false;` with the typed-state reset:

```ts
function next(): void {
    index += 1;
    flashPhase = "prompt";
    typedAnswer = "";
    feedback = "";
    gaveUp = false;
    gradeError = "";
    chosen = null;
    startedAt = Date.now();
    now = Date.now();
}
```

e. `onKeydown` — replace the flashcard else-branch (the `!revealed` / `["1","2","3","4"]` block) with:

```ts
} else if (flashPhase === "graded" && (key === " " || key === "enter")) {
    event.preventDefault();
    next();
}
```

f. Add the verdict label reactive statement (near the other `$:` lines):

```ts
$: verdictLabel = gaveUp
    ? "Didn't know — marked Again"
    : verdict === AnswerMcatCardTypedResponse_Verdict.CORRECT
    ? "Correct"
    : verdict === AnswerMcatCardTypedResponse_Verdict.PARTIAL
    ? "Partially correct"
    : "Incorrect";
```

- [ ] **Step 3: Replace the flashcard markup branch** (everything between `{:else}` after the MCQ block and the final `{/if}` of the kind switch — currently the `QuestionCard front=... center` line through the ratings/reveal block):

```svelte
{:else}
    <QuestionCard front={item.front} alt={`${item.leafName} prompt`} center />
    {#if flashPhase === "prompt" || flashPhase === "error"}
        <div class="typed-entry">
            <!-- svelte-ignore a11y-autofocus -->
            <textarea
                bind:value={typedAnswer}
                rows="3"
                placeholder="Describe this term from memory…"
                autofocus
                on:keydown={onAnswerKeydown}
            ></textarea>
            <div class="typed-actions">
                <button class="primary" on:click={() => submitTyped(false)}>
                    Submit <KeyHint key="↵" />
                </button>
                <IdkButton on:choose={() => submitTyped(true)} />
            </div>
        </div>
        {#if flashPhase === "error"}
            <div class="feedback grade-error">
                <strong>Grading failed — your answer is kept.</strong>
                <p>{gradeError}</p>
                <button class="primary" on:click={() => submitTyped(gaveUp)}>
                    Retry
                </button>
            </div>
        {/if}
    {:else}
        <div class="answer">
            <hr />
            <p class="back">{item.back}</p>
        </div>
        {#if !gaveUp && typedAnswer.trim()}
            <p class="typed-echo"><span>Your answer:</span> {typedAnswer}</p>
        {/if}
        {#if flashPhase === "grading"}
            <div class="grading">Grading your answer…</div>
        {:else}
            <div
                class="feedback"
                class:correct={!gaveUp &&
                    verdict === AnswerMcatCardTypedResponse_Verdict.CORRECT}
                class:partial={!gaveUp &&
                    verdict === AnswerMcatCardTypedResponse_Verdict.PARTIAL}
                class:idk={gaveUp}
            >
                <strong>{verdictLabel}</strong>
                {#if feedback}
                    <p>{feedback}</p>
                {/if}
                <button class="primary" on:click={next}>
                    Continue <KeyHint key="␣" />
                </button>
            </div>
        {/if}
    {/if}
{/if}
```

- [ ] **Step 4: CSS** — delete the now-unused `.reveal`, `.ratings`, and `.rating*` rules; add:

```scss
    .typed-entry {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .typed-entry textarea {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 4.5rem;
        padding: 0.6rem 0.75rem;
        border-radius: var(--sf-r-sm);
        border: 1px solid var(--sf-border);
        background: none;
        color: inherit;
        font: inherit;
        line-height: 1.5;
        @include sf.focusable;
    }

    .typed-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .typed-echo {
        flex-shrink: 0;
        margin: 0;
        font-size: 0.95rem;
        opacity: 0.85;

        span {
            font-weight: 600;
        }
    }

    .grading {
        flex-shrink: 0;
        padding: 0.6rem 1rem;
        font-weight: 600;
        animation: sf-grading-pulse 1.2s ease-in-out infinite;
    }

    @keyframes sf-grading-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.45;
        }
    }

    .feedback.partial {
        border-left-color: var(--sf-warn);
    }

    .grade-error {
        border-left-color: var(--sf-err);
    }
```

(If `--sf-warn` isn't defined in `../lib/mixins`/theme vars, use the same value the MCQ `.rating.hard` used — check before inventing a token.)

- [ ] **Step 5: Typecheck + lint**

```powershell
tools\ninja check:svelte
```

Expected: clean (no unused-selector or a11y warnings).

- [ ] **Step 6: Commit**

```powershell
git add ts/routes/mcat/study/StudyPage.svelte
git commit -m "feat(mcat): typed short-answer flashcard flow with LLM verdict UI"
```

---

### Task 8: Full build, docs, and end-to-end verification

**Files:**

- Modify: `Planning/PRD.md`
- Everything built by `tools\ninja pylib qt check`

- [ ] **Step 1: PRD — grading section.** In `Planning/PRD.md`, replace the `FLASHCARDS (rote) - SELF-GRADED...` paragraph (starts "FLASHCARDS (rote) - SELF-GRADED (standard Anki):") with:

```
FLASHCARDS (rote) - TYPED + LLM-GRADED: the student TYPES a short description of the term (or clicks "I don't know" / submits empty to flip immediately, which grades Again with no LLM call). An OpenAI model (default gpt-5-mini, MCAT_GRADER_MODEL override; OPENAI_API_KEY loaded from questionbankparsing/.env at startup) grades the typed answer against the card back for MEANING, not wording, returning correct/partial/incorrect + a one-line feedback note. Mapping: incorrect -> Again; partial -> Hard; correct -> Easy when faster than the typed-mode fast threshold, else Good. Grading is MANDATORY (block-until-graded): transient failures retry with backoff (5 attempts, 2->60s), and on hard failure the card stays UNANSWERED with a Retry in the UI - there is NO self-grade fallback. Every graded review is persisted to the mcat_answer_log table (revlog id, verdict, typed answer, feedback, model) in the same transaction as the answer, making flashcard correctness OBJECTIVE: verdict-backed correct recalls count fully toward the fluency gate's spaced-correct requirement, while legacy self-graded reviews are discounted (SELF_GRADED_EVIDENCE_WEIGHT = 0.5). Typed-mode latency thresholds (typed_latency: fast 20s / slow 45s, PLACEHOLDER) replace the button-mode flashcard thresholds for these reviews, since typing time inflates latency.
```

- [ ] **Step 2: PRD — consistency sweep.** Update the stale self-grading references:
  - Line 4 (`SCOPE (MVP)`): change "LLM explanation-grading remains future work." to "Flashcard short-answer grading is LLM-based (see GRADING & RATING); LLM explanation-grading for MCQ reasoning remains future work."
  - SCORING MODEL rationale line 50: change "(flashcard self-grading feeds FSRS scheduling only)" to "(flashcard answers are LLM-graded; see GRADING & RATING)".
  - Line 55 automaticity parenthetical "(Flashcards are self-graded, but Anki still records answer latency...)" → "(Flashcard latency is recorded on every review; typed-mode reviews use wider thresholds.)".
  - Screen 4 (Study) line 191: "FLASHCARD: front -> reveal -> SELF-GRADE Again/Hard/Good/Easy (keys 1-4)" → "FLASHCARD: front -> typed short answer (Enter submits, Esc/I-don't-know flips) -> LLM verdict + feedback -> Continue".
  - Line 194 `[RESOLVED: rote flashcards use standard SELF-GRADING...]` → `[RESOLVED 2026-07-02: rote flashcards are TYPED + LLM-GRADED (no grade buttons); MCQs remain auto-graded from choice + latency. See GRADING & RATING.]`
  - DATA MODEL PER-CARD STATE paragraph: append "Typed-answer reviews additionally persist a row in `mcat_answer_log` (rslib/src/storage/mcat/) linking the revlog entry to its LLM verdict, the student's typed answer, feedback, and model — the objectivity marker for the fluency gate and the archive for future explanation-grading."
  - IMPLEMENTATION STATUS "NOT YET BUILT" list: remove "LLM explanation grading" and add a line to the built list: "LLM short-answer grading for flashcards (grader.rs + AnswerMcatCardTyped RPC + typed StudyPage flow; spec docs/superpowers/specs/2026-07-02-llm-flashcard-grading-design.md)". Keep MCQ explanation grading listed as future work.

- [ ] **Step 3: Full build + checks.** Close any running dev Anki first (it locks `_rsbridge.pyd`), then:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
tools\ninja pylib qt check
```

Expected: format, Rust/Python/TS checks and tests all pass. If the CargoBuild glob misses `grader.rs`, delete `out\build.ninja` and rerun.

- [ ] **Step 4: Rust test suite sanity**

```powershell
cargo test -p anki --lib
```

Expected: all pass (~560+ tests).

- [ ] **Step 5: Manual end-to-end QA** (real key, real model): launch the app (`just run` equivalent: `tools\ninja run`, or ask the user to run it), open Study, and verify on a flashcard:
  1. typing a decent description → back + "Grading…" → verdict chip + feedback, Continue advances;
  2. "I don't know" → instant flip, "Didn't know — marked Again";
  3. empty submit behaves like I-don't-know;
  4. with `OPENAI_API_KEY` removed from the environment and `.env` renamed → submit shows "Grading failed", Retry after restoring works;
  5. dashboard readiness recomputes after the session.
     Record what was verified in the commit/report.

- [ ] **Step 6: Commit**

```powershell
git add Planning/PRD.md
git commit -m "docs(mcat): PRD reflects LLM-graded typed flashcards"
```

---

## Self-Review Notes

- Spec coverage: §1 flow → Task 7; §2 mapping/model → Tasks 1, 4; §3 RPC/grader/env/log/gate → Tasks 2, 3, 5, 6; §4 error policy → Tasks 4 (retries), 5 (unanswered on failure), 7 (Retry UI); §5 testing → unit tests in Tasks 1-5, live smoke in Task 4, lint/build/manual in Tasks 7-8; PRD update → Task 8.
- Type consistency: `GradedAnswer`/`Verdict`/`typed_latency` defined once in Task 1 and imported everywhere else; storage method names match between Tasks 2, 3, 5.
- The one intentionally-deferred check: exact visibility of `Backend::web_client`/`runtime_handle` (Task 5 Step 6 says widen to `pub(crate)` if needed) and the `--sf-warn` token (Task 7 Step 4) — both verified at execution time against compiler/linter output rather than guessed here.
