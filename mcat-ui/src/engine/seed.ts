// Builds the engine's card pool from fixtures and, for the demo, a synthetic but
// realistic review history that is REPLAYED THROUGH FSRS (so states are genuine,
// not fabricated). The dashboard/scores then come entirely from the engine.
//
// Curation goal for a fresh "Study" session: subtopics that have question
// fixtures are made fluent (gate OPEN -> their questions become application
// practice), while subtopics that only have flashcards stay building (gate
// CLOSED -> rote). Synthetic history uses `seed*` card ids so the real fixtures
// stay "unseen" and remain selectable.
import { FLASHCARDS } from "../fixtures/flashcards";
import questionsData from "../fixtures/questions.json";
import { type Leaf, LEAF_BY_ID, LEAVES } from "../lib/taxonomy";
import type { Flashcard, QuestionFixture } from "../lib/types";
import { newCardState, updateState } from "./fsrs";
import type { Card, EngineState, Grade } from "./model";
import { DAY_MS } from "./model";

export const QUESTIONS = questionsData as QuestionFixture[];

export interface Fixtures {
    cards: Record<string, Card>;
    selectableIds: string[];
    flashcardContent: Record<string, Flashcard>;
    questionContent: Record<string, QuestionFixture>;
}

export function buildFixtures(): Fixtures {
    const cards: Record<string, Card> = {};
    const flashcardContent: Record<string, Flashcard> = {};
    const questionContent: Record<string, QuestionFixture> = {};
    const selectableIds: string[] = [];

    for (const fc of FLASHCARDS) {
        cards[fc.id] = {
            id: fc.id,
            leafId: fc.leafId,
            section: fc.section,
            kind: "flashcard",
            isApplication: false,
            isCars: false,
            difficulty: 3,
        };
        flashcardContent[fc.id] = fc;
        selectableIds.push(fc.id);
    }
    for (const q of QUESTIONS) {
        const leafId = q.tags.contentCategory ?? "1A";
        const leaf = LEAF_BY_ID[leafId];
        cards[q.id] = {
            id: q.id,
            leafId,
            section: leaf?.section ?? "BBLS",
            kind: "mcq",
            isApplication: true,
            isCars: !!leaf?.isCars,
            difficulty: q.difficulty,
        };
        questionContent[q.id] = q;
        selectableIds.push(q.id);
    }
    return { cards, selectableIds, flashcardContent, questionContent };
}

// Cold start (post-onboarding diagnostic): fixture cards, zero history.
export function buildColdState(): EngineState {
    const { cards } = buildFixtures();
    return { cards: { ...cards }, fsrs: {}, revlog: [] };
}

const SEED_FLUENT = new Set(["1B", "1C", "5B", "5D", "9A", "10A"]); // gate OPEN
const SEED_ROTE = new Set(["1A", "1D", "5A", "7A", "4C"]); // gate CLOSED

function hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff;
}

type Level = "none" | "building" | "fluent" | "applied";
function seedLevel(leaf: Leaf): Level {
    if (leaf.isCars) { return "applied"; }
    if (SEED_FLUENT.has(leaf.id)) { return "fluent"; }
    if (SEED_ROTE.has(leaf.id)) { return "building"; }
    const r = hash(leaf.id);
    if (r < 0.15) { return "none"; }
    if (r < 0.7) { return "building"; }
    return "fluent";
}

// A leaf made fluent via demonstrated application (correct + fast, spaced).
function seedApplication(state: EngineState, leafId: string, isCars: boolean, now: number) {
    const daysAgo = [40, 25, 12];
    daysAgo.forEach((d, i) => {
        state.revlog.push({
            cardId: `seedapp-${leafId}-${i}`,
            leafId,
            ts: now - d * DAY_MS,
            grade: 4,
            correct: true,
            ms: isCars ? 55_000 : 30_000, // fast for the type
            kind: "mcq",
            isApplication: true,
            isCars,
            elapsedDays: 0,
            massed: false,
            productiveFailure: false,
        });
    });
}

// A "building" leaf: a productive failure then one spaced, mid-speed correct
// recall -> assessed, moderate fluency, gate stays closed.
function seedRote(state: EngineState, leaf: Leaf, now: number) {
    const cardId = `seedrote-${leaf.id}`;
    state.cards[cardId] = {
        id: cardId,
        leafId: leaf.id,
        section: leaf.section,
        kind: "flashcard",
        isApplication: false,
        isCars: false,
        difficulty: 3,
    };
    const plan: { grade: Grade; ms: number; daysAgo: number }[] = [
        { grade: 1, ms: 13_000, daysAgo: 30 }, // first-exposure miss (productive failure)
        { grade: 3, ms: 10_000, daysAgo: 8 }, // spaced correct, mid speed
    ];
    let cardState = newCardState(now - 30 * DAY_MS);
    let prevTs = 0;
    for (const p of plan) {
        const ts = now - p.daysAgo * DAY_MS;
        const correct = p.grade !== 1;
        const elapsedDays = prevTs ? (ts - prevTs) / DAY_MS : 0;
        const massed = cardState.reps > 0 && elapsedDays < 1;
        const productiveFailure = !correct && cardState.reps === 0;
        state.revlog.push({
            cardId,
            leafId: leaf.id,
            ts,
            grade: p.grade,
            correct,
            ms: p.ms,
            kind: "flashcard",
            isApplication: false,
            isCars: false,
            elapsedDays,
            massed,
            productiveFailure,
        });
        cardState = updateState(cardState, p.grade, ts, 0.9).state;
        prevTs = ts;
    }
    state.fsrs[cardId] = cardState;
}

// Rich demo state: fixture cards + a synthetic, FSRS-replayed history.
export function buildSeededState(now: number): EngineState {
    const { cards } = buildFixtures();
    const state: EngineState = { cards: { ...cards }, fsrs: {}, revlog: [] };
    for (const leaf of LEAVES) {
        const level = seedLevel(leaf);
        if (level === "none") { continue; }
        if (level === "fluent" || level === "applied") { seedApplication(state, leaf.id, leaf.isCars, now); }
        else { seedRote(state, leaf, now); }
    }
    return state;
}
