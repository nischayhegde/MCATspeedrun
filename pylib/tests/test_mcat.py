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
