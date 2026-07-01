# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""End-to-end smoke test for the MCAT layer, driven through the real Rust backend.

Flow exercised:

    import parsed qbank + flashcards  ->  cold readiness
      ->  stratified diagnostic  ->  auto-graded answers  ->  recomputed readiness
      ->  interleaved study queue  ->  answered items  ->  final readiness

Run with the built pylib on the path, e.g.:

    out\\pyenv\\Scripts\\python.exe -m mcat_tools.e2e_test

Set MCAT_QBANK / MCAT_FLASHCARDS to point at a different content root.
"""

from __future__ import annotations

import os
import random
import sys
import tempfile

from anki.collection import Collection

from mcat_tools.importer import (
    FLASHCARD_NOTETYPE,
    MCQ_NOTETYPE,
    import_all,
)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(REPO, "questionbankparsing", "output")

# content roots to import (each has questions/ + flashcards.deduped.jsonl)
CONTENT_ROOTS = [
    os.path.join(OUTPUT, "practice"),
    os.path.join(OUTPUT, "qbank"),
]

CLAMP_LO, CLAMP_HI = 472, 528


class Check:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def ok(self, cond: bool, msg: str) -> None:
        status = "PASS" if cond else "FAIL"
        print(f"  [{status}] {msg}")
        if not cond:
            self.failures.append(msg)


def _card_ids_for_notes(col: Collection, notetype: str) -> list[int]:
    ids: list[int] = []
    for nid in col.find_notes(f'note:"{notetype}"'):
        ids.extend(col.get_note(nid).card_ids())
    return ids


def main() -> int:
    rng = random.Random(20260701)
    check = Check()

    tmp = tempfile.mkdtemp(prefix="mcat_e2e_")
    col_path = os.path.join(tmp, "collection.anki2")
    col = Collection(col_path)
    print(f"collection: {col_path}")

    try:
        # ---- import ---------------------------------------------------------
        total_mcq = total_fc = 0
        for root in CONTENT_ROOTS:
            if not os.path.isdir(root):
                print(f"  (skip missing root {root})")
                continue
            flashcards = os.path.join(root, "flashcards.deduped.jsonl")
            stats = import_all(col, root, flashcards, deck_name="MCAT")
            print(
                f"  import {os.path.basename(root)}: "
                f"+{stats.mcq_added} mcq (skip {stats.mcq_skipped}), "
                f"+{stats.flashcards_added} fc (skip {stats.flashcards_skipped})"
            )
            for err in stats.errors[:5]:
                print(f"      err: {err}")
            total_mcq += stats.mcq_added
            total_fc += stats.flashcards_added

        mcq_cards = _card_ids_for_notes(col, MCQ_NOTETYPE)
        fc_cards = _card_ids_for_notes(col, FLASHCARD_NOTETYPE)
        check.ok(total_mcq > 0, f"imported MCQs (>0): {total_mcq}")
        check.ok(total_fc > 0, f"imported flashcards (>0): {total_fc}")
        check.ok(len(mcq_cards) == total_mcq, "one card per MCQ note")

        # ---- cold readiness -------------------------------------------------
        cold = col._backend.recompute_mcat_leaf_states()
        print(
            f"  cold readiness={cold.readiness_score} "
            f"conf=±{cold.confidence_band} assessed="
            f"{sum(1 for l in cold.leaves if l.assessed)}/{len(cold.leaves)}"
        )
        check.ok(
            CLAMP_LO <= cold.readiness_score <= CLAMP_HI,
            f"cold readiness clamped to [{CLAMP_LO},{CLAMP_HI}]",
        )
        check.ok(len(cold.leaves) > 0, "leaf states materialised")

        # ---- diagnostic determinism ----------------------------------------
        d1 = col._backend.get_mcat_diagnostic(question_count=120, seed=7)
        d2 = col._backend.get_mcat_diagnostic(question_count=120, seed=7)
        ids1 = [it.card_id for it in d1]
        ids2 = [it.card_id for it in d2]
        check.ok(len(ids1) > 0, f"diagnostic returned items: {len(ids1)}")
        check.ok(ids1 == ids2, "diagnostic deterministic for a fixed seed")
        check.ok(len(set(ids1)) == len(ids1), "diagnostic has no duplicate cards")
        check.ok(
            all(it.kind == 1 for it in d1),  # 1 == MCQ
            "diagnostic contains only MCQ items",
        )
        leaves_covered = {it.leaf_id for it in d1}
        sections_covered = {it.section for it in d1}
        print(
            f"  diagnostic: {len(ids1)} items across "
            f"{len(leaves_covered)} leaves / {len(sections_covered)} sections"
        )
        check.ok(len(leaves_covered) >= 3, "diagnostic spans multiple subtopics")

        # ---- answer the diagnostic (simulate a ~65%-correct test taker) -----
        answered = 0
        for it in d1:
            correct = rng.random() < 0.65
            # correct answers land fast-ish; misses tend to be slow
            ms = rng.randint(8_000, 20_000) if correct else rng.randint(20_000, 90_000)
            col._backend.answer_mcat_card(
                card_id=it.card_id,
                correct=correct,
                milliseconds_taken=ms,
                self_rating=0,
            )
            answered += 1
        print(f"  answered {answered} diagnostic items")

        post = col._backend.recompute_mcat_leaf_states()
        assessed_after = sum(1 for l in post.leaves if l.assessed)
        gates_open = sum(1 for l in post.leaves if l.gate_open)
        print(
            f"  post-diagnostic readiness={post.readiness_score} "
            f"conf=±{post.confidence_band} assessed={assessed_after} "
            f"gates_open={gates_open}"
        )
        check.ok(
            CLAMP_LO <= post.readiness_score <= CLAMP_HI,
            "post-diagnostic readiness clamped",
        )
        check.ok(assessed_after > 0, "some subtopics assessed after diagnostic")
        check.ok(
            post.confidence_band <= cold.confidence_band,
            "confidence band tightened (or held) with more evidence",
        )

        # ---- study loop -----------------------------------------------------
        queue = col._backend.get_mcat_study_queue(session_size=60)
        kinds = {0: 0, 1: 0}
        for it in queue:
            kinds[it.kind] = kinds.get(it.kind, 0) + 1
        print(
            f"  study queue: {len(queue)} items "
            f"(flashcards={kinds.get(0, 0)}, mcq={kinds.get(1, 0)})"
        )
        check.ok(len(queue) > 0, "study queue produced items")

        # no two consecutive items from the same subtopic (interleaving)
        adjacent_same = any(
            queue[i].leaf_id == queue[i + 1].leaf_id
            and queue[i].leaf_id != ""
            for i in range(len(queue) - 1)
        )
        check.ok(not adjacent_same, "study queue interleaves subtopics")

        studied = 0
        for it in queue:
            if it.kind == 1:  # MCQ
                col._backend.answer_mcat_card(
                    card_id=it.card_id,
                    correct=rng.random() < 0.7,
                    milliseconds_taken=rng.randint(6_000, 30_000),
                    self_rating=0,
                )
            else:  # flashcard self-grade
                col._backend.answer_mcat_card(
                    card_id=it.card_id,
                    correct=True,
                    milliseconds_taken=rng.randint(2_000, 8_000),
                    self_rating=rng.choice([2, 3, 3, 4]),
                )
            studied += 1
        print(f"  answered {studied} study items")

        final = col._backend.recompute_mcat_leaf_states()
        print(
            f"  final readiness={final.readiness_score} "
            f"conf=±{final.confidence_band} "
            f"assessed={sum(1 for l in final.leaves if l.assessed)}"
        )
        check.ok(
            CLAMP_LO <= final.readiness_score <= CLAMP_HI,
            "final readiness clamped",
        )

        # a second study queue should not re-serve the just-seen MCQs
        queue2 = col._backend.get_mcat_study_queue(session_size=60)
        seen_mcqs = {it.card_id for it in queue if it.kind == 1}
        reserved = [it.card_id for it in queue2 if it.kind == 1 and it.card_id in seen_mcqs]
        check.ok(
            len(reserved) == 0,
            "answered MCQs are not immediately re-served",
        )

    finally:
        col.close()

    print()
    if check.failures:
        print(f"E2E FAILED: {len(check.failures)} check(s) failed")
        for f in check.failures:
            print(f"  - {f}")
        return 1
    print("E2E PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
