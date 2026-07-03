# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""End-to-end smoke test for LLM-graded typed flashcard answers.

Drives the real AnswerMcatCardTyped RPC through the built pylib against the
LIVE OpenAI API, exercising the full production path:
Python -> _rsbridge.pyd -> Rust service -> OpenAI -> transaction -> storage.

Run with the built pylib on the path and the key available:

    $env:PYTHONPATH = "<repo>\\out\\pylib;<repo>"
    <repo>\\out\\pyenv\\Scripts\\python.exe -m mcat_tools.e2e_typed_grading
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from anki.collection import Collection
from anki.models import NotetypeDict

REPO = Path(__file__).resolve().parents[1]
LEAF_TAG = "mcat::cc::1D"


def _load_env() -> None:
    """Mirror aqt._load_openai_env so the RPC sees OPENAI_API_KEY."""
    env_path = REPO / "questionbankparsing" / ".env"
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


def _flashcard_notetype(col: Collection) -> NotetypeDict:
    mm = col.models
    nt = mm.new("MCAT Flashcard E2E")
    for field in ("Front", "Back"):
        mm.add_field(nt, mm.new_field(field))
    tmpl = mm.new_template("Card 1")
    tmpl["qfmt"] = "{{Front}}"
    tmpl["afmt"] = '{{FrontSide}}<hr id="answer">{{Back}}'
    mm.add_template(nt, tmpl)
    mm.add(nt)
    return nt


def _add_flashcard(col: Collection, nt: NotetypeDict, term: str, desc: str) -> int:
    note = col.new_note(nt)
    note["Front"] = term
    note["Back"] = desc
    note.tags = [LEAF_TAG]
    col.add_note(note, col.decks.id("MCAT"))
    return note.card_ids()[0]


class Check:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def ok(self, cond: bool, msg: str) -> None:
        print(f"  [{'PASS' if cond else 'FAIL'}] {msg}")
        if not cond:
            self.failures.append(msg)


def main() -> int:
    _load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not available; cannot run live grading test")
        return 2

    check = Check()
    tmp = tempfile.mkdtemp(prefix="mcat_typed_e2e_")
    col = Collection(os.path.join(tmp, "collection.anki2"))
    try:
        nt = _flashcard_notetype(col)
        good_card = _add_flashcard(
            col,
            nt,
            "Glycolysis",
            "The metabolic pathway that splits one glucose into two pyruvate, "
            "producing a net 2 ATP and 2 NADH in the cytoplasm.",
        )
        wrong_card = _add_flashcard(
            col,
            nt,
            "Glycolysis",
            "The metabolic pathway that splits one glucose into two pyruvate, "
            "producing a net 2 ATP and 2 NADH in the cytoplasm.",
        )
        idk_card = _add_flashcard(
            col,
            nt,
            "Glycolysis",
            "The metabolic pathway that splits one glucose into two pyruvate, "
            "producing a net 2 ATP and 2 NADH in the cytoplasm.",
        )

        # ---- a solid answer should grade correct/partial (pass) and fast ----
        r = col._backend.answer_mcat_card_typed(
            card_id=good_card,
            typed_answer=(
                "It breaks glucose down into two pyruvate molecules and makes a "
                "net of 2 ATP and 2 NADH."
            ),
            milliseconds_taken=12_000,
            gave_up=False,
        )
        # Verdict enum: 0 INCORRECT, 1 PARTIAL, 2 CORRECT; grade 1..4
        print(f"  good answer -> verdict={r.verdict} grade={r.grade} feedback={r.feedback!r}")
        check.ok(r.verdict in (1, 2), "solid answer graded correct/partial")
        check.ok(r.grade in (2, 3, 4), "solid answer got a passing FSRS grade")

        # ---- a clearly wrong answer should grade incorrect -> Again ---------
        r = col._backend.answer_mcat_card_typed(
            card_id=wrong_card,
            typed_answer="It is the powerhouse of the cell and stores genetic information.",
            milliseconds_taken=15_000,
            gave_up=False,
        )
        print(f"  wrong answer -> verdict={r.verdict} grade={r.grade} feedback={r.feedback!r}")
        check.ok(r.verdict == 0, "off-topic answer graded incorrect")
        check.ok(r.grade == 1, "incorrect answer mapped to Again")

        # ---- I-don't-know: no LLM call, graded Again, empty feedback --------
        r = col._backend.answer_mcat_card_typed(
            card_id=idk_card,
            typed_answer="",
            milliseconds_taken=1_500,
            gave_up=True,
        )
        print(f"  gave-up -> verdict={r.verdict} grade={r.grade} feedback={r.feedback!r}")
        check.ok(r.verdict == 0 and r.grade == 1, "gave-up graded Again")
        check.ok(r.feedback == "", "gave-up has no feedback")

        # ---- persistence: revlog rows written, answer-log objectivity -------
        for cid in (good_card, wrong_card, idk_card):
            entries = col.db.all("select id from revlog where cid = ?", cid)
            check.ok(len(entries) == 1, f"card {cid} has exactly one revlog row")
        log_rows = col.db.scalar("select count(*) from mcat_answer_log")
        check.ok(log_rows == 3, f"mcat_answer_log has 3 rows (got {log_rows})")

        # ---- objectivity feeds the leaf state (recompute reads the log) -----
        post = col._backend.recompute_mcat_leaf_states()
        leaf = next((l for l in post.leaves if l.leaf_id == "1D"), None)
        check.ok(leaf is not None and leaf.assessed, "leaf 1D assessed after typed answers")

        print()
        if check.failures:
            print(f"FAILED: {len(check.failures)} check(s) failed")
            return 1
        print("ALL CHECKS PASSED")
        return 0
    finally:
        col.close()


if __name__ == "__main__":
    sys.exit(main())
