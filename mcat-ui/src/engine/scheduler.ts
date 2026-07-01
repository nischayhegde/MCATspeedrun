// Problem/flashcard selection. Builds one interleaved study queue from the PRD
// STUDY LOOP:
//   1. Rote flashcards that are FSRS-due for subtopics whose fluency gate is CLOSED.
//   2. Fresh application MCQs for gate-OPEN subtopics (and CARS), spaced at the
//      subtopic level so we don't hammer one topic in a day.
//   3. New content for unassessed subtopics (capped by newPerDay).
// Then order by dueness, cap per-leaf + per-session, and interleave so no two
// same-subtopic items sit adjacent (which also mixes rote with application).
import { LEAF_BY_ID } from "../lib/taxonomy";
import type { LeafState } from "../lib/types";
import type { EngineState, FsrsCardState, StudyConfig } from "./model";
import { DAY_MS } from "./model";

export interface QueueItem {
    cardId: string;
    kind: "flashcard" | "mcq";
    leafId: string;
}

type Cand = QueueItem & { due: number; isNew: boolean };

const PER_LEAF_MAX = 3;

// Overdue-ness in days (higher = more due). New cards get a mid priority.
function dueScore(st: FsrsCardState | undefined, now: number): number {
    if (!st || st.reps === 0) { return 1; }
    return Math.max(0, (now - st.due) / DAY_MS);
}

// Subtopic-level application spacing: interval grows with prior correct reps.
function applicationDue(lastTs: number | undefined, correctCount: number, now: number): boolean {
    if (!lastTs) { return true; }
    const intervalDays = Math.min(21, Math.pow(2, correctCount));
    return (now - lastTs) / DAY_MS >= intervalDays;
}

export function buildQueue(
    state: EngineState,
    scores: Record<string, LeafState>,
    selectableIds: string[],
    now: number,
    config: StudyConfig,
): QueueItem[] {
    const cands: Cand[] = [];
    const seen = new Set(state.revlog.map((e) => e.cardId));

    const lastApp = new Map<string, number>();
    const appCorrect = new Map<string, number>();
    for (const e of state.revlog) {
        if (!(e.isApplication || e.isCars)) { continue; }
        lastApp.set(e.leafId, Math.max(lastApp.get(e.leafId) ?? 0, e.ts));
        if (e.correct) { appCorrect.set(e.leafId, (appCorrect.get(e.leafId) ?? 0) + 1); }
    }

    for (const id of selectableIds) {
        const card = state.cards[id];
        if (!card) { continue; }
        const sc = scores[card.leafId];
        const st = state.fsrs[id];

        if (card.kind === "flashcard") {
            // rote only while the subtopic is NOT fluent (gate closed)
            if (sc?.gateOpen) { continue; }
            const isNew = !st || st.reps === 0;
            const due = isNew || (st ? st.due <= now : true);
            if (due) {
                cands.push({ cardId: id, kind: "flashcard", leafId: card.leafId, due: dueScore(st, now), isNew });
            }
        } else {
            // application: fresh (unseen) MCQs for gate-open leaves (or CARS)
            if (seen.has(id)) { continue; }
            if (!(sc?.gateOpen || card.isCars)) { continue; }
            if (!applicationDue(lastApp.get(card.leafId), appCorrect.get(card.leafId) ?? 0, now)) { continue; }
            cands.push({ cardId: id, kind: "mcq", leafId: card.leafId, due: 1, isNew: false });
        }
    }

    // (3) new-content fallback if the session would be thin, high-yield first
    if (cands.length < 6) {
        const extra = selectableIds
            .map((id) => state.cards[id])
            .filter((c) => c && !scores[c.leafId]?.assessed && !cands.some((x) => x.cardId === c.id))
            .sort((a, b) => (LEAF_BY_ID[b.leafId]?.weight ?? 0) - (LEAF_BY_ID[a.leafId]?.weight ?? 0));
        for (const c of extra) { cands.push({ cardId: c.id, kind: c.kind, leafId: c.leafId, due: 0.5, isNew: true }); }
    }

    cands.sort((a, b) => b.due - a.due);

    // caps: per-leaf, per-day new, per-session
    const perLeaf = new Map<string, number>();
    let newCount = 0;
    const cap = Math.min(config.sessionSize, config.maxReviews);
    const capped: Cand[] = [];
    for (const c of cands) {
        const n = perLeaf.get(c.leafId) ?? 0;
        if (n >= PER_LEAF_MAX) { continue; }
        if (c.isNew && newCount >= config.newPerDay) { continue; }
        perLeaf.set(c.leafId, n + 1);
        if (c.isNew) { newCount++; }
        capped.push(c);
        if (capped.length >= cap) { break; }
    }

    return interleave(capped);
}

// Round-robin across subtopic buckets so no two same-subtopic items are adjacent.
function interleave(items: Cand[]): QueueItem[] {
    const buckets = new Map<string, Cand[]>();
    for (const it of items) {
        const a = buckets.get(it.leafId);
        if (a) { a.push(it); }
        else { buckets.set(it.leafId, [it]); }
    }
    const result: QueueItem[] = [];
    let last: string | null = null;
    let remaining = items.length;
    while (remaining > 0) {
        const nonEmpty = [...buckets.entries()].filter(([, arr]) => arr.length > 0);
        let pool = nonEmpty.filter(([k]) => k !== last);
        if (pool.length === 0) { pool = nonEmpty; }
        pool.sort((a, b) => b[1].length - a[1].length);
        const [key, arr] = pool[0];
        const it = arr.shift()!;
        result.push({ cardId: it.cardId, kind: it.kind, leafId: it.leafId });
        last = key;
        remaining--;
    }
    return result;
}
