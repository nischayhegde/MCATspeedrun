# Fluency 80% pin + application starvation fixes

Date: 2026-07-01
Status: implemented

## Symptoms (user-reported)

1. Per-subtopic **fluency pinned at exactly 80%** on the dashboard and never
   rose, no matter how much rote practice was done.
2. Subtopics that clearly **needed application work got no MCQs** in study
   sessions.

## Root causes

### Fluency

- `fastness()` (aggregate.rs) was a step function: 1.0 at ≤ fast, **0.4** for
  anything between fast and slow, 0.0 at ≥ slow. A learner answering
  flashcards correctly at a normal (Good) pace earns automaticity ≈ 0.4, so
  rote fluency = `0.5*durability + 0.5*automaticity` ≤ ~0.7 — permanently
  below both the 0.8 display floor and (with imperfect durability) the 0.75
  gate threshold.
- The PRD's "demonstrated application implies fluency" rule was implemented as
  a **constant** `fluency.max(0.8)`. Since rote fluency couldn't cross 0.8
  (above) and the implied value never scaled, every practiced leaf displayed
  exactly 80% forever; MCQ-only leaves (no rote pool) were pinned even with
  perfect application records.

### Application scheduling

- Application priority topped out at ~2.0 (`APPLICATION_BASE 1.0 + recency
  ≤ 1.0`; the stale boost rarely fires for rote-backed leaves whose freshness
  = durability ≥ 0.6). New rote is 2.5 and due maintenance 3.0 + overdue-days
  (unbounded), so any rote backlog filled the whole session — zero MCQs.
- The scheduler never looked at a leaf's **application score**: a weak topic
  had no more claim on a slot than a strong one.
- A leaf with **no rote cards at all** could never open its fluency gate
  (nothing to drill), so its MCQs could never be served — a permanent
  deadlock for exactly the topics that most need application practice.

## Fixes

### aggregate.rs

- `fastness()` is now a **continuous linear ramp**: 1.0 at ≤ fast, 0.0 at
  ≥ slow, `(slow-ms)/(slow-fast)` in between (consistent with the continuous
  spacing weights philosophy). The application speed bonus keeps its exact old
  semantics by testing `ms <= latency.fast` directly.
- Application-implied fluency scales:
  `fluency = max(fluency, max(APP_FLUENCY_FLOOR, application))` — the PRD
  floor (0.8) holds for any demonstrated application, and a strong application
  record lifts fluency toward 1.0 instead of pinning at the floor.

### scheduler.rs

- **Need boost**: application candidates gain
  `APP_NEED_BOOST * (1 - application_score)` priority (max +1.5), so gate-open
  leaves with weak application outrank new rote and typical maintenance.
- **Reserved application share**: `APP_RESERVE_FRAC` (1/3) of the session's
  slots are seated with the highest-priority application candidates first
  (fresh MCQs only, not new-content fallback), then the remainder fills by
  priority as before. An arbitrarily overdue rote backlog can no longer starve
  application out of a session. Per-leaf caps hold across both passes; the
  final selection is re-sorted by priority before interleaving.
- **Gate bypass for rote-less leaves**: MCQs of a leaf with no flashcards in
  the collection skip the fluency gate (it could never open), removing the
  deadlock. CARS was already exempt.

## Constants (model.rs, tunable)

```
APP_FLUENCY_FLOOR = 0.8
APP_NEED_BOOST    = 1.5
APP_RESERVE_FRAC  = 1/3
```

## Not changed

- `mcat-ui/src/engine` (frozen TS reference) — Rust remains source of truth.
- Gate rules (threshold 0.75, effective spaced-correct ≥ 2, lapse demotion),
  grade mapping, readiness/confidence math, storage/proto schemas.

## Tests

New (all failed before the fix, TDD):

- `aggregate::mid_speed_recalls_earn_partial_automaticity` (was 0.65 ceiling)
- `aggregate::strong_application_lifts_fluency_above_the_floor` (was 0.8 pin)
- `aggregate::weak_demonstrated_application_keeps_the_fluency_floor` (floor guard)
- `scheduler::rote_backlog_cannot_starve_application` (was 0 MCQs / 12 slots)
- `scheduler::weakest_application_leaf_wins_the_slot` (need boost)
- `scheduler::mcq_only_leaf_is_not_gate_deadlocked` (gate bypass)

All 42 mcat unit tests, the full 563-test rslib suite, workspace clippy, and
`mcat_tools.e2e_test` (real-backend end-to-end) pass.
