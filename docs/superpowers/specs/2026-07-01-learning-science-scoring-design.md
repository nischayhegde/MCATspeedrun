# Learning-science scoring edits: expected time, spacing weights, recalibration, shrinkage confidence

Date: 2026-07-01
Status: approved (user), implementing

## Motivation

Four learning-science-grounded improvements to the MCAT scoring/scheduling layer
(`rslib/src/mcat/`), approved after design discussion:

1. **Tediousness-adjusted expected time.** A long answer time only signals
   non-fluency if the item shouldn't take that long. The parser already scores
   every question on `reasoning_complexity` (rc) and `calculation_tedium` (ct)
   1-5; an item high on either is _legitimately_ slow even for a fluent student.
   Latency thresholds must scale with rc/ct so slow-but-tedious isn't
   misflagged as "reasoning through / working-memory reliance".
2. **Continuous spacing weights.** The spacing effect is continuous; the current
   binary `massed` cutoff (same-day = ignored, else full weight) is a cliff.
   A recall after a longer gap is stronger durability evidence.
3. **Recalibration for stale leaves.** Science leaves self-refresh via FSRS due
   cards, but gate-open/CARS leaves with no rote layer can go silently stale;
   nothing forces a fresh application draw, so readiness rests on old evidence.
4. **Shrinkage readiness + variance-based confidence.** Raw mastery treats one
   lucky fast guess the same as ten spaced correct attempts, and the v1
   confidence heuristic (cbrt of coverage*depth*freshness) is ad hoc. Shrink
   low-evidence mastery toward a low prior and derive confidence from a real
   propagated uncertainty.

Explicitly **rejected** during design: distinguishing fast-wrong vs slow-wrong
(all wrong = `Again`), and the full Beta-posterior confidence model (schema
churn not warranted yet; the shrinkage model is its cheap approximation).

## 1. Expected time from rc/ct (MCQs only)

- `mcat_tools/importer.py` additionally tags each MCQ note with
  `mcat::rc::<N>` and `mcat::ct::<N>` from `difficulty.reasoning_complexity` /
  `difficulty.calculation_tedium` (default 3 when absent, clamped 1-5).
- `adapter.rs` parses them (generalizing the existing `mcat::diff::N` parser).
- `model.rs` gains:
  - `expected_latency(kind, rc, ct) -> Latency`: base `latency_for(kind)`
    scaled by `1.0 + 0.15*(rc-3) + 0.15*(ct-3)`, clamped to `[0.5, 2.0]`.
    Flashcards are exempt (fast facts stay fast: flat threshold).
  - `Review` carries its per-item `latency: Latency`.
- `grade_mcq` takes the resolved `Latency` instead of an `ItemKind`;
  `mcat_answer_card` and the aggregate layer's fastness math use the per-item
  thresholds. rc=ct=3 (or missing tags) reproduces today's behavior exactly.

## 2. Continuous spacing weights (aggregate.rs)

- **Rote:** each review's evidence weight becomes
  `spacing_weight = clamp01(elapsed_days / 3.0)`, with the first-ever review of
  a card weighted 1.0. This multiplies into the existing recency-weighted mean
  for automaticity (replacing the hard `massed` filter). The fluency-gate count
  becomes _effective_ spaced-correct: `sum(spacing_weight)` over correct rote
  recalls, gate requires `>= 2.0` (two fully-spaced correct recalls, or more
  partially-spaced ones).
- **Application:** MCQs are one-shot per card, so spacing is measured between
  consecutive application attempts _within the leaf_. First attempt = 1.0;
  subsequent = `max(0.3, clamp01(gap_days / 1.0))`. The 0.3 floor reflects that
  same-day attempts are distinct fresh problems (correlated but still
  evidence) — and keeps the diagnostic (many same-day attempts per leaf) able
  to seed estimates.
- `LeafState.attempts` becomes fractional **effective evidence** (`f32`,
  sum of spacing weights across rote+application attempts). SQLite needs no
  migration (dynamically typed; rusqlite reads old integer rows as f64). The
  proto field stays `uint32`, rounded for display.

## 3. Stale-leaf recalibration boost (scheduler.rs)

For application candidates of gate-open (or CARS) leaves whose persisted
`freshness < 0.6`, priority gets `+ 1.5 * (0.6 - freshness) / 0.6`. A fully
stale leaf reaches priority ~3.5, outranking maintenance rote, so probe items
reliably win the session caps instead of losing to recently-practiced leaves.
No new storage; uses the freshness already in `LeafState`.

## 4. Shrinkage readiness + confidence (scoring.rs)

- Effective evidence per leaf: `n_i = attempts_i * freshness_i` (stale evidence
  counts less).
- `evidence_weight w = n / (n + N_TARGET)` (existing `N_TARGET = 5`).
- `mastery_adjusted = w * mastery_raw + (1 - w) * PRIOR_MASTERY` with
  `PRIOR_MASTERY = 0.1`. Readiness (and the per-leaf `mastery` proto field) use
  the adjusted value. Consequence: a cold collection reads ~478, not 472, and a
  perfect-but-lightly-evidenced student no longer pins 528 — the score honestly
  reflects evidence.
- Confidence from propagated uncertainty: per-leaf
  `sigma_i = 0.5 / sqrt(1 + n_i)`; readiness sigma combines an independent and
  a correlated term (student ability correlates across leaves; pure
  independence would be overconfident):
  `sigma^2 = (1-rho) * sum((wbar_i*sigma_i)^2) + rho * (sum(wbar_i*sigma_i))^2`
  with `rho = 0.3` and `wbar` the normalized blueprint weights.
  - `confidence_band = round(1.96 * sigma * 56)` clamped to `[1, 28]`
    (± points on the 472-528 scale).
  - `confidence_pct = 100 * (1 - sigma / sigma_0)` where `sigma_0` is the
    zero-evidence sigma — 0% cold, →100% as evidence accumulates.
  - Coverage/depth/freshness remain as reported diagnostics (depth now uses
    effective attempts).
- Expected trajectory: cold = 0%, ±28 → post-diagnostic ≈ 50%, ±16 →
  deep study (n≈20/leaf) ≈ 78%, ±7.

## Constants (model.rs, all tunable)

```
TEDIUM_LATENCY_STEP = 0.15   LATENCY_SCALE = [0.5, 2.0]
SPACING_FULL_DAYS = 3.0      APP_SPACING_FULL_DAYS = 1.0   APP_SPACING_FLOOR = 0.3
SPACED_CORRECT_TARGET = 2.0
STALE_FRESHNESS = 0.6        STALE_APP_BOOST = 1.5
PRIOR_MASTERY = 0.1          SIGMA_MAX = 0.5   LEAF_CORRELATION = 0.3
```

## Out of scope

- `mcat-ui/src/engine` (TS reference engine) is not updated; the Rust layer is
  the source of truth and the Svelte frontend talks to it over RPC.
- No proto changes; no SQLite schema changes.
- Confidence calibration UI, discrimination-based interleaving, forward-testing
  ordering: possible future work, not in this change.

## Testing

- Unit tests per module: latency scaling/clamping/defaults; spacing-weight
  math (same-day repeats ≈ no evidence, 3-day gap = full; app floor);
  fractional attempts; gate on effective spaced-correct; stale-leaf boost
  ordering; shrinkage monotonicity; confidence 0% cold / tightening with
  evidence; band bounds.
- Existing suite updated where semantics intentionally changed
  (e.g. cold readiness 472 → ~478).
- `mcat_tools/e2e_test.py` asserts ranges/monotonicity and should pass as-is.
