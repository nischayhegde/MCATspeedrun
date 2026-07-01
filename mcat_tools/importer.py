# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""Import parsed MCAT content into an Anki collection.

Two content sources are supported:

* **Question bank** (`questionbankparsing/output/qbank/questions/<id>/data.json`
  + `image.png`): one MCQ note per accepted question. The composite question
  image is copied into the collection's media folder and referenced from the
  ``Image`` field; the choices, answer letter, and explanation come from
  ``data.json``. Each note is tagged with its MCAT leaf, difficulty, and
  ``mcat::app`` so the scheduler treats it as an application item.

* **Flashcards** (`flashcards.deduped.jsonl`): one rote note per term. These are
  tagged with the leaf inferred from the linked questions (via
  ``question_ids``), so they participate in the fluency gate for that subtopic.

The importer is idempotent per source id: it records the external id in a
``McatId`` field and skips notes that already exist.

Tagging convention (matches ``rslib/src/mcat``):
    mcat::cc::<CC>        e.g. mcat::cc::1B      (science content category)
    mcat::cars::<SKILL>   e.g. mcat::cars::CARS1 (CARS skill)
    mcat::app                                     (marks an application/MCQ item)
    mcat::diff::<N>       e.g. mcat::diff::2      (overall difficulty 1..5)
    mcat::rc::<N>         reasoning complexity 1..5 (expected-time scaling)
    mcat::ct::<N>         calculation tedium 1..5   (expected-time scaling)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Iterable

from anki.collection import Collection
from anki.models import NotetypeDict
from anki.notes import Note

MCQ_NOTETYPE = "MCAT MCQ"
FLASHCARD_NOTETYPE = "MCAT Flashcard"

# CARS content categories in the parsed data use the section tag "CARS" with a
# skill in `skills` like "CARS1"; science items use `content_category` (e.g. 2B)
CARS_SECTION = "CARS"


@dataclass
class ImportStats:
    mcq_added: int = 0
    mcq_skipped: int = 0
    flashcards_added: int = 0
    flashcards_skipped: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "mcq_added": self.mcq_added,
            "mcq_skipped": self.mcq_skipped,
            "flashcards_added": self.flashcards_added,
            "flashcards_skipped": self.flashcards_skipped,
            "errors": self.errors,
        }


def _leaf_tag_for(tags: dict[str, Any]) -> str | None:
    """Return the leaf tag (mcat::cc::X or mcat::cars::X) for a question."""
    section = (tags.get("section") or "").upper()
    if section == CARS_SECTION:
        skills = tags.get("skills") or []
        for s in skills:
            s = str(s).strip().upper()
            if s.startswith("CARS"):
                return f"mcat::cars::{s}"
        return None
    cc = (tags.get("content_category") or "").strip().upper()
    if cc:
        return f"mcat::cc::{cc}"
    return None


def _difficulty_marker(data: dict[str, Any], key: str) -> int:
    """One of the parser's 1-5 difficulty markers; 3 (typical) when absent."""
    diff = data.get("difficulty")
    if isinstance(diff, dict):
        value = diff.get(key)
        if isinstance(value, (int, float)):
            return max(1, min(5, int(round(value))))
    return 3


def _ensure_notetype(
    col: Collection, name: str, fields: list[str], front: str, back: str
) -> NotetypeDict:
    existing = col.models.by_name(name)
    if existing:
        return existing
    nt = col.models.new(name)
    for fname in fields:
        col.models.add_field(nt, col.models.new_field(fname))
    tmpl = col.models.new_template("Card 1")
    tmpl["qfmt"] = front
    tmpl["afmt"] = back
    col.models.add_template(nt, tmpl)
    col.models.add(nt)
    return col.models.by_name(name)


def ensure_notetypes(col: Collection) -> None:
    _ensure_notetype(
        col,
        MCQ_NOTETYPE,
        ["McatId", "Question", "Image", "A", "B", "C", "D", "Answer", "Explanation"],
        front='{{Question}}<br>{{Image}}',
        back='{{FrontSide}}<hr id="answer">Correct: {{Answer}}<br>{{Explanation}}',
    )
    _ensure_notetype(
        col,
        FLASHCARD_NOTETYPE,
        ["McatId", "Front", "Back"],
        front="{{Front}}",
        back='{{FrontSide}}<hr id="answer">{{Back}}',
    )


def _existing_ids(col: Collection, notetype_name: str) -> set[str]:
    """All McatId values already present for a notetype."""
    nt = col.models.by_name(notetype_name)
    if not nt:
        return set()
    out: set[str] = set()
    for nid in col.find_notes(f'note:"{notetype_name}"'):
        note = col.get_note(nid)
        out.add(note["McatId"])
    return out


def iter_question_dirs(qbank_dir: str) -> Iterable[str]:
    questions_root = os.path.join(qbank_dir, "questions")
    if not os.path.isdir(questions_root):
        return
    for name in sorted(os.listdir(questions_root)):
        path = os.path.join(questions_root, name)
        if os.path.isdir(path) and os.path.exists(os.path.join(path, "data.json")):
            yield path


def import_questions(
    col: Collection,
    qbank_dir: str,
    deck_id: int,
    stats: ImportStats,
    limit: int | None = None,
) -> None:
    existing = _existing_ids(col, MCQ_NOTETYPE)
    nt = col.models.by_name(MCQ_NOTETYPE)
    count = 0
    for qdir in iter_question_dirs(qbank_dir):
        if limit is not None and count >= limit:
            break
        data_path = os.path.join(qdir, "data.json")
        try:
            with open(data_path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            stats.errors.append(f"{data_path}: {exc}")
            continue

        qid = str(data.get("id") or os.path.basename(qdir))
        if qid in existing:
            stats.mcq_skipped += 1
            continue

        leaf_tag = _leaf_tag_for(data.get("tags") or {})
        if not leaf_tag:
            stats.mcq_skipped += 1
            continue

        choices = data.get("choices") or {}
        answer = (data.get("answer") or {}).get("letter", "")
        explanation = (data.get("answer") or {}).get("explanation", "")
        stem = data.get("stem") or ""

        # copy the composite image into media, namespaced by question id
        image_ref = ""
        image_path = os.path.join(qdir, data.get("image_path") or "image.png")
        if os.path.exists(image_path):
            fname = col.media.add_file(image_path)
            image_ref = f'<img src="{fname}">'

        note = Note(col, nt)
        note["McatId"] = qid
        note["Question"] = stem.replace("\n", "<br>")
        note["Image"] = image_ref
        note["A"] = choices.get("A", "")
        note["B"] = choices.get("B", "")
        note["C"] = choices.get("C", "")
        note["D"] = choices.get("D", "")
        note["Answer"] = answer
        note["Explanation"] = explanation

        is_cars = leaf_tag.startswith("mcat::cars::")
        note.tags = [
            leaf_tag,
            "mcat::app",
            f"mcat::diff::{_difficulty_marker(data, 'overall')}",
            # expected-time scaling markers (see rslib expected_latency)
            f"mcat::rc::{_difficulty_marker(data, 'reasoning_complexity')}",
            f"mcat::ct::{_difficulty_marker(data, 'calculation_tedium')}",
        ]
        if is_cars:
            note.tags.append("mcat::cars")

        col.add_note(note, deck_id)
        existing.add(qid)
        stats.mcq_added += 1
        count += 1


def _leaf_for_flashcard(
    fc: dict[str, Any], question_leaf: dict[str, str]
) -> str | None:
    """Infer a flashcard's leaf tag from its linked question ids."""
    counts: dict[str, int] = {}
    for qid in fc.get("question_ids") or []:
        tag = question_leaf.get(str(qid))
        if tag:
            counts[tag] = counts.get(tag, 0) + 1
    if not counts:
        return None
    # most common leaf among the linked questions
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _build_question_leaf_index(qbank_dir: str) -> dict[str, str]:
    index: dict[str, str] = {}
    for qdir in iter_question_dirs(qbank_dir):
        try:
            with open(os.path.join(qdir, "data.json"), encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        tag = _leaf_tag_for(data.get("tags") or {})
        if tag:
            index[str(data.get("id"))] = tag
    return index


def import_flashcards(
    col: Collection,
    flashcards_path: str,
    qbank_dir: str,
    deck_id: int,
    stats: ImportStats,
    limit: int | None = None,
) -> None:
    if not os.path.exists(flashcards_path):
        stats.errors.append(f"flashcards file not found: {flashcards_path}")
        return
    existing = _existing_ids(col, FLASHCARD_NOTETYPE)
    nt = col.models.by_name(FLASHCARD_NOTETYPE)
    question_leaf = _build_question_leaf_index(qbank_dir)

    count = 0
    with open(flashcards_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if limit is not None and count >= limit:
                break
            try:
                fc = json.loads(line)
            except json.JSONDecodeError as exc:
                stats.errors.append(f"flashcard line: {exc}")
                continue

            term = (fc.get("term") or "").strip()
            desc = (fc.get("description") or "").strip()
            if not term or not desc:
                stats.flashcards_skipped += 1
                continue
            fid = f"fc::{term.lower()}"
            if fid in existing:
                stats.flashcards_skipped += 1
                continue

            leaf_tag = _leaf_for_flashcard(fc, question_leaf)
            if not leaf_tag or leaf_tag.startswith("mcat::cars::"):
                # rote flashcards only make sense for science leaves
                stats.flashcards_skipped += 1
                continue

            note = Note(col, nt)
            note["McatId"] = fid
            note["Front"] = term
            note["Back"] = desc
            note.tags = [leaf_tag]

            col.add_note(note, deck_id)
            existing.add(fid)
            stats.flashcards_added += 1
            count += 1


def import_all(
    col: Collection,
    qbank_dir: str,
    flashcards_path: str,
    deck_name: str = "MCAT",
    question_limit: int | None = None,
    flashcard_limit: int | None = None,
) -> ImportStats:
    ensure_notetypes(col)
    deck_id = col.decks.id(deck_name)
    stats = ImportStats()
    import_questions(col, qbank_dir, deck_id, stats, limit=question_limit)
    import_flashcards(
        col, flashcards_path, qbank_dir, deck_id, stats, limit=flashcard_limit
    )
    return stats
