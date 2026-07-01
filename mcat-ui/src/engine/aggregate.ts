// Derives the per-leaf study state (fluency, application, gate, freshness, depth)
// from the raw review log + FSRS memory states. This is the "scoring" layer that
// sits on top of FSRS: FSRS answers "when to review", this answers "how well does
// the learner know this subtopic, and is the rote->application gate open".
import { clamp01, FLUENCY_THRESHOLD, LATENCY } from "../lib/scoring";
import { type Leaf, LEAVES } from "../lib/taxonomy";
import type { LeafState } from "../lib/types";
import { currentRetrievability } from "./fsrs";
import type { EngineState, FsrsCardState, RevlogEntry } from "./model";
import { DAY_MS } from "./model";

const RECENCY_TAU_DAYS = 21; // recency half-life-ish for weighting evidence

function recencyWeight(ageDays: number): number {
    return Math.exp(-Math.max(0, ageDays) / RECENCY_TAU_DAYS);
}

// 1 fast, 0 slow, 0.4 in between.
function fastness(ms: number, t: { fast: number; slow: number }): number {
    if (ms <= t.fast) { return 1; }
    if (ms >= t.slow) { return 0; }
    return 0.4;
}

function recencyWeightedMean(
    entries: RevlogEntry[],
    now: number,
    val: (e: RevlogEntry) => number,
): number {
    if (!entries.length) { return 0; }
    let ws = 0;
    let vs = 0;
    for (const e of entries) {
        const w = recencyWeight((now - e.ts) / DAY_MS);
        ws += w;
        vs += w * val(e);
    }
    return ws ? vs / ws : 0;
}

export function computeLeafScores(state: EngineState, now: number): Record<string, LeafState> {
    const byLeaf = new Map<string, RevlogEntry[]>();
    for (const e of state.revlog) {
        const a = byLeaf.get(e.leafId);
        if (a) { a.push(e); }
        else { byLeaf.set(e.leafId, [e]); }
    }

    // FSRS states of rote cards, grouped by leaf (for durability = retention now)
    const roteStates = new Map<string, FsrsCardState[]>();
    for (const id in state.cards) {
        const c = state.cards[id];
        if (c.kind !== "flashcard") { continue; }
        const st = state.fsrs[id];
        if (st && st.reps > 0) {
            const a = roteStates.get(c.leafId);
            if (a) { a.push(st); }
            else { roteStates.set(c.leafId, [st]); }
        }
    }

    const out: Record<string, LeafState> = {};
    for (const leaf of LEAVES) {
        out[leaf.id] = scoreLeaf(leaf, byLeaf.get(leaf.id) ?? [], roteStates.get(leaf.id) ?? [], now);
    }
    return out;
}

function scoreLeaf(
    leaf: Leaf,
    entriesIn: RevlogEntry[],
    roteStates: FsrsCardState[],
    now: number,
): LeafState {
    const entries = entriesIn.slice().sort((a, b) => a.ts - b.ts);
    const rote = entries.filter((e) => e.kind === "flashcard");
    const app = entries.filter((e) => e.isApplication || e.isCars);

    // durability = mean current retrievability across the leaf's rote cards
    const durability = roteStates.length
        ? roteStates.reduce((s, st) => s + currentRetrievability(st, now), 0) / roteStates.length
        : 0;

    // automaticity = recency-weighted fastness of SPACED correct rote recalls
    const spacedRote = rote.filter((e) => !e.massed);
    const automaticity = recencyWeightedMean(spacedRote, now, (e) => e.correct ? fastness(e.ms, LATENCY.flashcard) : 0);
    const spacedCorrect = spacedRote.filter((e) => e.correct).length;

    // application = recency-weighted correctness (with a speed bonus)
    const application = recencyWeightedMean(app, now, (e) => {
        if (!e.correct) { return 0; }
        const t = e.isCars ? LATENCY.cars : LATENCY.application;
        return fastness(e.ms, t) >= 0.5 ? 1 : 0.7;
    });
    const applicationDemonstrated = app.some((e) => e.correct);

    // fluency: combine durability + automaticity. Demonstrated application implies
    // fluency (bidirectional inference in the PRD).
    let fluency = leaf.isCars ? 0 : clamp01(0.5 * durability + 0.5 * automaticity);
    if (!leaf.isCars && applicationDemonstrated) { fluency = Math.max(fluency, 0.8); }

    // demotion: if the most recent evidence is a genuine (post-learning) lapse,
    // the gate closes and the leaf drops back to rote.
    const latest = entries[entries.length - 1];
    const recentLapse = !!latest
        && !latest.correct
        && !latest.productiveFailure
        && (roteStates.some((s) => s.reps > 1) || app.length > 1);

    const gateOpen = leaf.isCars
        ? true // CARS is application-only, always "open"
        : !recentLapse && ((fluency >= FLUENCY_THRESHOLD && spacedCorrect >= 2) || applicationDemonstrated);

    const lastAppAge = app.length ? (now - app[app.length - 1].ts) / DAY_MS : Infinity;
    const freshness = leaf.isCars
        ? (app.length ? recencyWeight(lastAppAge) : 0)
        : roteStates.length
        ? durability
        : app.length
        ? recencyWeight(lastAppAge)
        : 0;

    return {
        id: leaf.id,
        fluency: clamp01(fluency),
        application: clamp01(application),
        attempts: spacedRote.length + app.length,
        freshness: clamp01(freshness),
        assessed: entries.length > 0,
        gateOpen,
    };
}
