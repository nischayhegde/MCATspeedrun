# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""Verify reset_mcat_progress wipes all study progress through the real backend.

Builds a tiny synthetic MCAT collection (one rote flashcard + one application
MCQ, both tagged to a real blueprint leaf), records some progress by answering
them, then calls the new reset RPC and asserts that:

    * the review log is empty,
    * every leaf state is back to baseline (unassessed, 0 attempts),
    * every card is back to "new" (type/queue new, 0 reps, no FSRS memory), and
    * imported notes/cards are still present (content preserved).

Run with the built pylib on the path:

    out\\pyenv\\Scripts\\python.exe -m mcat_tools.reset_verify
"""

from __future__ import annotations

import sys
import tempfile

from anki.collection import Collection
from anki.notes import Note


class Check:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def ok(self, cond: bool, msg: str) -> None:
        print(f"  [{'PASS' if cond else 'FAIL'}] {msg}")
        if not cond:
            self.failures.append(msg)


def main() -> int:
    check = Check()
    tmp = tempfile.mkdtemp(prefix="mcat_reset_")
    col = Collection(f"{tmp}/collection.anki2")
    try:
        # Pick a real, non-CARS blueprint leaf to tag against.
        leaves = col._backend.compute_mcat_readiness().leaves
        leaf = next(l for l in leaves if not l.is_cars)
        leaf_id = leaf.leaf_id
        print(f"tagging against leaf {leaf_id} ({leaf.name})")

        did = col.decks.id("MCAT")
        basic = col.models.by_name("Basic")

        def add(front: str, back: str, tags: list[str]) -> int:
            note = Note(col, basic)
            note["Front"] = front
            note["Back"] = back
            note.tags = tags
            col.add_note(note, did)
            return note.card_ids()[0]

        fc_card = add("rote q", "rote a", [f"mcat::cc::{leaf_id}"])
        mcq_card = add("app q", "app a", [f"mcat::cc::{leaf_id}", "mcat::app"])

        # ---- create progress ------------------------------------------------
        col._backend.answer_mcat_card(
            card_id=fc_card, correct=True, milliseconds_taken=4000, self_rating=3
        )
        col._backend.answer_mcat_card(
            card_id=mcq_card, correct=True, milliseconds_taken=3000, self_rating=0
        )
        col._backend.recompute_mcat_leaf_states()

        revlog_before = col.db.scalar("select count() from revlog")
        assessed_before = sum(
            1 for l in col._backend.compute_mcat_readiness().leaves if l.assessed
        )
        touched_before = col.db.scalar(
            "select count() from cards where type != 0 or queue != 0 or reps != 0"
        )
        notes_before = col.db.scalar("select count() from notes")
        print(
            f"before reset: revlog={revlog_before}, assessed leaves={assessed_before}, "
            f"non-new cards={touched_before}, notes={notes_before}"
        )
        check.ok(revlog_before > 0, "progress exists before reset (revlog rows)")
        check.ok(assessed_before > 0, "progress exists before reset (assessed leaf)")
        check.ok(touched_before > 0, "progress exists before reset (scheduled card)")

        # ---- reset ----------------------------------------------------------
        resp = col._backend.reset_mcat_progress()

        revlog_after = col.db.scalar("select count() from revlog")
        assessed_after = sum(1 for l in resp.leaves if l.assessed)
        attempts_after = sum(l.attempts for l in resp.leaves)
        touched_after = col.db.scalar(
            "select count() from cards where type != 0 or queue != 0 or reps != 0"
        )
        memory_after = col.db.scalar(
            "select count() from cards where data like '%\"s\"%'"
        )
        notes_after = col.db.scalar("select count() from notes")
        print(
            f"after reset:  revlog={revlog_after}, assessed leaves={assessed_after}, "
            f"attempts sum={attempts_after}, non-new cards={touched_after}, "
            f"cards w/ memory={memory_after}, notes={notes_after}"
        )

        check.ok(revlog_after == 0, "review log fully wiped")
        check.ok(assessed_after == 0, "no leaf remains assessed")
        check.ok(attempts_after == 0, "no leaf retains attempts")
        check.ok(touched_after == 0, "every card reset to new (type/queue/reps)")
        check.ok(memory_after == 0, "FSRS memory state cleared on all cards")
        check.ok(notes_after == notes_before, "imported notes preserved")
        check.ok(
            472 <= resp.readiness_score <= 528,
            f"reset returns baseline readiness on the MCAT scale ({resp.readiness_score})",
        )

        # idempotent: resetting again must not error and stays clean
        col._backend.reset_mcat_progress()
        check.ok(
            col.db.scalar("select count() from revlog") == 0,
            "second reset stays clean (idempotent)",
        )
    finally:
        col.close()

    print()
    if check.failures:
        print(f"FAILED ({len(check.failures)}):")
        for f in check.failures:
            print(f"  - {f}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
