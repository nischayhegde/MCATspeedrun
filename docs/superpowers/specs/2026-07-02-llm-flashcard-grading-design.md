# LLM-Graded Short-Answer Flashcards — Design

**Date:** 2026-07-02
**Status:** Approved

## Problem

Rote flashcards are currently self-graded (Again/Hard/Good/Easy). Per the PRD,
self-assessment is unreliable (Hendrick), which is why a flashcard "Easy" never
opens the fluency gate today. This feature replaces self-grading with an
objective path: the student **types a description of the term**, an LLM grades
it against the card's canonical description, and the grade is applied
automatically. A student who doesn't know the answer at all can flip the card
immediately ("I don't know") without typing anything.

## Decisions (user-confirmed)

1. **Fully automatic grading** — the LLM verdict maps straight to an FSRS
   rating. The user sees the verdict and the correct answer, then continues.
   No override, no advisory mode.
2. **Block until graded** — there is no fallback to self-grade buttons. On
   transient failure the system retries; on hard failure the user retries the
   same submission. Study on flashcards requires grading to succeed.
3. **LLM grades count as objective evidence** — the fluency scoring layer
   (`aggregate.rs`) is upgraded so verdict-backed flashcard correctness counts
   toward the fluency gate, alongside latency.
4. **Verdict + targeted feedback** — after grading, the UI shows the card
   back, a verdict chip, and a one-line LLM note on what was missing/wrong.
5. **Architecture: Rust RPC** — grading lives in rslib behind one new
   protobuf RPC; grade + card answer commit atomically.

## Scope

- Applies to **rote flashcards only**, in the unified Study session. MCQs
  (already auto-graded) and the diagnostic (MCQ-only) are unchanged.
- Desktop-only, consistent with the MVP.

## 1. Interaction flow (frontend)

`ts/routes/mcat/study/StudyPage.svelte`, flashcard branch:

1. **Front shown**: autofocused text input ("Describe this term…"), a
   **Submit** button (Enter submits), and an **I don't know** button (reuses
   the existing `IdkButton` from the MCQ flow).
2. **Submit**: the back is revealed immediately, the user's typed answer is
   displayed alongside it, and a "Grading…" spinner runs. When the verdict
   arrives: a chip — Correct / Partially correct / Incorrect — plus the
   one-line feedback. **Continue** (Enter/Space) advances. The FSRS rating is
   applied automatically; the four grade buttons are gone for flashcards.
3. **I don't know / empty submit**: reveals the back instantly, no LLM call,
   auto-rated **Again**, still logged as objective evidence (an explicit
   "don't know" is trustworthy).
4. **Latency**: `milliseconds_taken` = card shown → submit pressed. Typing
   time inflates this relative to the old button flow, so typed-mode
   automaticity thresholds are a new tunable (placeholder like the PRD's
   other latency thresholds; calibrate later).
5. Input is disabled while a grading request is in flight.

## 2. Grading model & FSRS mapping

The LLM returns structured JSON: `verdict ∈ {correct, partial, incorrect}`
and `feedback` (one sentence). Correctness decides pass/fail; latency
modulates only full-credit answers — mirroring the MCQ auto-grade design:

| Outcome              | FSRS rating |
| -------------------- | ----------- |
| I don't know / empty | Again (1)   |
| incorrect            | Again (1)   |
| partial              | Hard (2)    |
| correct, slow        | Good (3)    |
| correct, fast        | Easy (4)    |

- Prompt grades **meaning, not wording**: synonyms/paraphrases pass; the key
  discriminating facts of the canonical description must be present. Inputs:
  term (card Front), canonical description (card Back), typed answer. MCAT
  context stated in the system prompt.
- `partial → Hard` is a deliberate judgment call (a passing FSRS grade that
  credits partial knowledge); tunable.
- Model: `gpt-5-mini` by default (fast/cheap; graded text is short),
  overridable via `MCAT_GRADER_MODEL`; deterministic settings (temperature 0
  or equivalent).

## 3. Backend architecture (Rust)

**New RPC** (`proto/anki/scheduler.proto`, `SchedulerService`):

```
AnswerMcatCardTyped(AnswerMcatCardTypedRequest) returns (AnswerMcatCardTypedResponse)

AnswerMcatCardTypedRequest  { int64 card_id; string typed_answer;
                              uint32 milliseconds_taken; bool gave_up; }
AnswerMcatCardTypedResponse { string verdict; string feedback; uint32 grade; }
```

- `gave_up=true` (I-don't-know / empty) skips the LLM and grades Again.
- Dispatch in `rslib/src/scheduler/service/mod.rs` next to `answer_mcat_card`;
  exposed via `exposed_backend_list` in `qt/aqt/mediasrv.py`; called from
  Svelte via the generated `@generated/backend` client.
- The existing `AnswerMcatCard` RPC remains for MCQs.

**Grader module** (`rslib/src/mcat/grader.rs`, new):

- `reqwest`-based OpenAI client modeled on the AnkiHub HTTP client
  (`rslib/src/ankihub/http_client/mod.rs`), calling OpenAI structured output
  with a JSON schema for `{verdict, feedback}`.
- Sits behind a trait so the RPC path is unit-testable with a mock grader.
- Grade + FSRS answer + answer-log write happen in one collection
  transaction; a crash never half-applies a review.

**API key / config**:

- At startup, aqt loads `questionbankparsing/.env` into the process
  environment (aqt and rslib share one process, so Rust reads
  `OPENAI_API_KEY` via `std::env`). A pre-set environment variable wins over
  the file. Missing key → immediate clear error at submit time, not a hang.

**Objectivity persistence** (new table `mcat_answer_log`,
`rslib/src/storage/mcat/`):

- Columns: card id, review timestamp (ms), verdict, typed answer, feedback,
  model. Written alongside the revlog entry in the same transaction.
- The gave-up path also writes an entry (verdict `incorrect`, empty typed
  answer/feedback, model empty) — an explicit "don't know" is objective
  evidence too.
- Purpose: (a) lets `RecomputeMcatLeafStates` distinguish LLM-graded reviews
  from historical self-graded ones; (b) archives student answers for the
  future explanation-grading work and tag-browser drill-down.

**Fluency gate upgrade** (`rslib/src/mcat/aggregate.rs`):

- Flashcard attempts with a verdict-backed `mcat_answer_log` entry count as
  **objective correctness evidence** toward the spaced-correct fluency
  requirement, alongside the latency/automaticity signal.
- Pre-feature reviews (no log entry) keep today's weaker self-graded
  treatment. No migration of historical data.

## 4. Error handling (block-until-graded)

- rslib retries transient failures — timeout, connection error, 429, 5xx —
  with exponential backoff (5 attempts, 2s → 60s), matching the
  `questionbankparsing` tenacity policy.
- If retries exhaust, the RPC returns an error and **the card is not
  answered** (nothing committed). The UI keeps the typed answer and shows
  "Grading failed — Retry", which resubmits the same answer.
- No self-grade fallback under any failure mode.

## 5. Testing

- **Rust unit tests** (`rslib/src/mcat/`): verdict→grade mapping including
  latency edges; gave-up path; `mcat_answer_log` persistence;
  aggregate objectivity (gate opens with LLM-verdict evidence, does not with
  legacy self-grades only) — all against the mocked grader trait.
- **Live smoke test**: one `#[ignore]`d Rust test hitting the real API,
  enabled by an env flag.
- **Frontend**: `just lint` (svelte/typescript checks); manual QA via
  `just run` with the real key.
- **Docs**: PRD updated — LLM grading moves from "future work" to
  implemented; GRADING & RATING section's flashcard path rewritten.

## Out of scope

- Explanation-grading for MCQ answers (separate future feature; this design's
  answer log is a stepping stone).
- Mobile/sync, settings-screen toggle for grading mode, recalibrated latency
  thresholds (placeholders only).
