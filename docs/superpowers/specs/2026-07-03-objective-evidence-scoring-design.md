# Objective-evidence scoring: untimed flashcards, guess correction, difficulty weights, recovery gate, pooled priors

Date: 2026-07-03
Status: approved (user directed implementation), implementing

## Motivation

A review of the scoring layer (`rslib/src/mcat/`) found one gate-integrity bug
and several places where the evidence model is weaker than the data we already
have. The user approved the full list and additionally decided that
**flashcards are no longer timed**: with LLM-verdict grading, correctness is
objective and answer latency is dominated by typing speed, so time pressure on
rote recall is noise. MCQs (study, diagnostic, CARS) remain timed.

Changes in this wave:

1. **Untimed flashcards.** Latency out of flashcard grading and fluency.
2. **Lucky-guess gate fix + chance-corrected application.** One correct
   4-option MCQ (~25% by luck) currently opens the fluency gate permanently
   (`application_demonstrated = any correct`), pinning fluency ≥ 0.8. With
   ~3-4 diagnostic items per leaf, a student who knows nothing falsely opens
   ~58% of gates.
3. **Difficulty-weighted correctness.** rc/ct only widen the time budget
   today; correctness evidence is difficulty-blind.
4. **Recovery-aware gate (demotion).** `recent_lapse` is last-review-only:
   one wrong closes the gate, the very next correct reopens it — oscillatory,
   and re-opening ignores how the lapse happened.
5. **Schedule-aware spacing weights (rote).** `elapsed_days / 3` treats a
   2-day scheduled review as partial evidence and a 60-day one the same as a
   3-day one. The card's own scheduled interval is in the revlog.
6. **Hierarchical (FC-pooled) shrinkage.** Thin leaves shrink toward a flat
   global 0.1 prior even when their foundational-concept siblings carry strong
   evidence — despite the confidence model already assuming rho = 0.3
   cross-leaf correlation.
7. **Per-student MCQ pace factor.** Fixed latency thresholds penalize
   uniformly slow readers.
8. **Partial credit.** A `Partial` LLM verdict currently counts as fully
   correct evidence (`Partial → Hard → correct = true`).

## 1. Untimed flashcards

- `grade_typed(verdict)` drops the `ms` parameter: `Correct → Good`,
  `Partial → Hard`, `Incorrect → Again`. `typed_latency()` is removed. Typed
  correct answers no longer earn `Easy` for speed; FSRS sees Good.
- The legacy self-graded flow is unchanged (button = grade), still discounted
  as evidence (`SELF_GRADED_EVIDENCE_WEIGHT`).
- **Fluency reformulated**: `fluency = 0.5 * durability + 0.5 * consistency`.
  - `durability` unchanged (mean FSRS retrievability of the leaf's rote cards).
  - `consistency` replaces latency-based automaticity: the recency+spacing
    weighted mean of _recall credit_ over rote reviews:
    `Good/Easy → 1.0`, `Hard → PARTIAL_CREDIT (0.5)`, `Again → 0.0`.
    Productive failures (first-exposure misses) are excluded — they are
    instruction events, not lapses (PRD).
- The `spaced_correct` gate sum likewise credits
  `spacing_weight * grade_credit * objectivity_discount` per rote recall,
  where `grade_credit` is 1.0 for Good/Easy and 0.5 for Hard/Partial.
- `Review.ms` / `Review.latency` stay on the struct but are only consulted for
  MCQ kinds. The client keeps sending `milliseconds_taken` (revlog analytics);
  the UI already hides the timer for flashcards.

## 2. Application = chance-corrected accuracy × speed quality (MCQs)

Per leaf, over application/CARS reviews with recency, spacing **and
difficulty** weights (§3):

- `p` = weighted mean of correctness (0/1).
- `p* = max(0, (p - GUESS_RATE) / (1 - GUESS_RATE))`, `GUESS_RATE = 0.25`
  (all our MCQs are 4-option, CARS included). A random guesser reads 0.
- `q` = weighted mean, over **correct** answers only, of
  `SPEED_QUALITY_FLOOR + (1 - SPEED_QUALITY_FLOOR) * fastness(ms, latency)`
  with `SPEED_QUALITY_FLOOR = 0.7`; `q = 1.0` when there are no correct
  answers. This replaces the 1.0/0.7 step with the same continuous ramp rote
  used to use.
- `application = p* × q`.

## 3. Difficulty-weighted evidence (MCQs only)

- `Review.difficulty: u8` (1..=5 from the existing `mcat::diff::N` tag,
  default 3).
- In the weighted mean for `p`, each review's weight is multiplied by
  `1 + DIFF_EVIDENCE_STEP * (d - 3)` when correct and
  `1 - DIFF_EVIDENCE_STEP * (d - 3)` when wrong, `DIFF_EVIDENCE_STEP = 0.15`.
  Getting hard items right counts more; missing easy items counts more
  against. 50% accuracy on hard items reads above 0.5, on easy items below.
- Flashcards are exempt (rote facts have no meaningful difficulty spread).

## 4. Gate: demonstrated application threshold + recovery-aware demotion

- **Demonstrated application** (opens the gate, sets the fluency floor) is no
  longer `.any(correct)`. It requires BOTH:
  - effective correct application evidence
    `sum(spacing_weight over correct app reviews) >= APP_DEMONSTRATED_TARGET`
    (`1.3`: a perfect 2-item same-day diagnostic leaf = 1.0 + 0.3 just opens;
    one lucky guess = 1.0 never does), AND
  - chance-corrected accuracy `p* >= APP_MIN_CORRECTED_ACCURACY (0.5)`.
- **Recovery-aware demotion** replaces `recent_lapse`: let `lapse_ts` be the
  timestamp of the most recent genuine miss (wrong, not a productive failure —
  rote or application). Gate evidence is counted **only from reviews after
  `lapse_ts`**:
  `gate_open = (fluency >= FLUENCY_THRESHOLD && spaced_correct_since >= SPACED_CORRECT_TARGET) || app_demonstrated_since`
  (the `p*` predicate stays whole-history; the volume thresholds are
  post-lapse). Behavior: one genuine miss still closes the gate immediately
  (PRD line 62), but a single next-day correct no longer reopens it — the
  student re-earns the gate with the same evidence bar as the first time.
  CARS remains always-open.

## 5. Schedule-aware rote spacing weight

- `Review.scheduled_days: f32` — the previous revlog entry's `interval` when
  positive (days), else 0.0 (first review / learning steps / unknown).
- `Review::spacing_weight()`:
  - if `scheduled_days >= 1.0`:
    `r_hat = 0.9^(elapsed_days / scheduled_days)` (0.9 = request retention at
    the scheduled due date), and
    `weight = clamp01((1 - r_hat) / (1 - R_TARGET))` — a review answered at
    its scheduled due date is full evidence regardless of interval length; an
    early review is proportionally weaker; overdue clamps at 1.0.
  - else: today's rule (first exposure 1.0; massed 0.0; else
    `clamp01(elapsed_days / SPACING_FULL_DAYS)`), so learning-phase and test
    fixtures behave identically.
- Application attempts keep the leaf-gap `app_spacing_weights` (cards are
  one-shot).

## 6. FC-pooled hierarchical shrinkage

- `Leaf` gains `fc: &'static str` — the foundational-concept group ("1".."10"
  for content categories, "CARS" for the three CARS skills).
- Per leaf, the shrinkage target becomes a sibling-pooled prior instead of the
  flat global one:
  `prior_i = (sum_{j in fc, j != i} n_j * m_j + FC_PRIOR_PSEUDO_N * PRIOR_MASTERY) / (sum_{j != i} n_j + FC_PRIOR_PSEUDO_N)`
  with `n_j` = effective evidence and `m_j` = raw mastery of the sibling.
  `mastery_adjusted = w * m_i + (1 - w) * prior_i`, `w = n / (n + N_TARGET)`
  as before. With no sibling evidence this reduces exactly to today's
  behavior; with strong siblings a thin leaf reads like its concept-mates
  instead of like an unknown.
- `mastery_adjusted` now needs sibling states: signature changes to take the
  full states map (readiness/confidence/service already have it).
- Confidence math unchanged.

## 7. Per-student MCQ pace factor

- During `mcat_recompute_all` (Recompute button / post-diagnostic): over all
  **correct, timed MCQ** reviews, compute
  `factor = median(ms_i / midpoint(latency_i))` where `midpoint = (fast+slow)/2`
  of that item's rc/ct-scaled thresholds. Require
  `>= PACE_MIN_SAMPLES (20)` samples; clamp to `[0.8, 1.25]`; store in the
  collection config under `mcatPaceFactor` (KV — no schema change).
- `note_expected_latency` multiplies MCQ thresholds by the stored factor.
  Flashcards unaffected (untimed).

## Constants (model.rs, all tunable)

```
GUESS_RATE = 0.25                 APP_DEMONSTRATED_TARGET = 1.3
APP_MIN_CORRECTED_ACCURACY = 0.5  DIFF_EVIDENCE_STEP = 0.15
PARTIAL_CREDIT = 0.5              SPEED_QUALITY_FLOOR = 0.7
FC_PRIOR_PSEUDO_N = 10.0          PACE_MIN_SAMPLES = 20
PACE_CLAMP = [0.8, 1.25]
```

Removed: `typed_latency()` (grader.rs). `latency_for(ItemKind::Flashcard)`
remains only as a Review-construction default; nothing reads it for scoring.

## Out of scope

- `mcat-ui/src/engine` (TS reference engine) — Rust remains source of truth.
- No proto or SQLite schema changes (`mcatPaceFactor` lives in col config).
- Elo/IRT item calibration and adaptive diagnostics — future work; the
  difficulty weighting here is the cheap approximation.
- LLM distractor analysis for MCQ wrong answers.

## Testing

- grader: verdict-only mapping (no ms).
- model: schedule-aware spacing weight (on-time = 1.0 at any interval, early
  proportionally low, overdue clamped, learning fallback identical).
- aggregate: consistency fluency (partial = 0.5, productive failures
  excluded); guesser application ≈ 0 (chance correction); one lucky correct
  no longer opens the gate or pins the floor; perfect 2-item diagnostic leaf
  still opens; difficulty weighting shifts p as specified; lapse closes gate
  and single correct does not reopen; recovery evidence reopens.
- scoring: FC pooling (no siblings = old behavior; strong siblings raise a
  thin leaf's adjusted mastery; CARS pools across CARS).
- adapter: scheduled_days from prev interval; difficulty from tags; pace
  factor computed/clamped/stored and applied to MCQ thresholds only.
- Existing tests updated where semantics intentionally changed.
- `mcat_tools/e2e_test.py` expectations reviewed (typed fast-correct now Good,
  not Easy).

## PRD updates

FLUENCY definition (consistency replaces latency automaticity for
flashcards; flashcards untimed), OBJECTIVE FLUENCY SIGNAL paragraph, gate
rules (demonstrated-application threshold, recovery-aware demotion), score
dynamics (chance correction, difficulty weights, pooled priors, pace factor).
