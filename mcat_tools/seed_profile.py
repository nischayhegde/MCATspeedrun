# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""Create a dedicated dev Anki profile and import the MCAT bank into it.

This lets us launch the app against a throwaway base folder (so the developer's
real Anki data is untouched) that already has content, so the diagnostic and
study loop have something to work with.

    out\\pyenv\\Scripts\\python.exe -m mcat_tools.seed_profile out\\mcat_base

Idempotent: re-running skips already-imported notes.
"""

from __future__ import annotations

import os
import sys

sys.path.extend(["pylib", "qt", "out/pylib", "out/qt"])

from aqt.profiles import ProfileManager

from anki.collection import Collection

from mcat_tools.importer import import_all

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(REPO, "questionbankparsing", "output")
CONTENT_ROOTS = [
    os.path.join(OUTPUT, "practice"),
    os.path.join(OUTPUT, "qbank"),
]
PROFILE = "User 1"


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "out", "mcat_base")
    base = os.path.abspath(base)
    os.makedirs(base, exist_ok=True)

    pm = ProfileManager(base)
    pm.setupMeta()
    pm.create(PROFILE)
    pm.load(PROFILE)
    # headless setup skips the first-run language dialog, so set it explicitly
    # (aqt reads pm.meta["defaultLang"] at startup and crashes on None).
    if not pm.meta.get("defaultLang"):
        pm.meta["defaultLang"] = "en_US"
        pm.save()
    col_path = pm.collectionPath()
    print(f"base={base}")
    print(f"collection={col_path}")

    col = Collection(col_path)
    try:
        for root in CONTENT_ROOTS:
            if not os.path.isdir(root):
                print(f"  (skip missing {root})")
                continue
            flashcards = os.path.join(root, "flashcards.deduped.jsonl")
            stats = import_all(col, root, flashcards, deck_name="MCAT")
            print(
                f"  {os.path.basename(root)}: "
                f"+{stats.mcq_added} mcq (skip {stats.mcq_skipped}), "
                f"+{stats.flashcards_added} fc (skip {stats.flashcards_skipped})"
            )
        readiness = col._backend.recompute_mcat_leaf_states()
        print(
            f"  readiness={readiness.readiness_score} "
            f"leaves={len(readiness.leaves)}"
        )
    finally:
        col.close()

    print("SEEDED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
