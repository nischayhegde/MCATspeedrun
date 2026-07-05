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

**Existing upstream files touched (all additive, +348/−2 lines total across 8 files):**

| File | Lines changed | What changed | Merge risk |
|---|---|---|---|
| `proto/anki/scheduler.proto` | +154 | New MCAT RPCs/messages appended to the service/file | Low — pure additions at the end of existing blocks; conflicts only if upstream also appends near the same lines. |
| `proto/anki/frontend.proto` | +17 | Frontend-facing message additions | Low, same reason. |
| `rslib/src/scheduler/service/mod.rs` | +156 | New `BackendSchedulerService` trait method impls (`compute_mcat_readiness` etc.) + `build_mcat_readiness` helper | Low-medium — this file is actively developed upstream (FSRS work lands here too), so line-based conflicts are plausible, but the new code is additive (new fn + new match arms), not a rewrite of existing logic. |
| `rslib/src/backend/mod.rs` | +2/−2 | Wiring for the new RPCs | Low — small, mechanical. |
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
