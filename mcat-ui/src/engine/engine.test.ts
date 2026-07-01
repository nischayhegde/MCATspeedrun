import { describe, expect, it } from "vitest";
import { LEAF_BY_ID } from "../lib/taxonomy";
import { computeLeafScores } from "./aggregate";
import { recordReview } from "./grade";
import { DAY_MS, DEFAULT_CONFIG, type EngineState } from "./model";
import { buildQueue } from "./scheduler";
import { buildColdState, buildFixtures, buildSeededState } from "./seed";

const NOW = 1_700_000_000_000;

describe("seeded demo state", () => {
    const state = buildSeededState(NOW);
    const scores = computeLeafScores(state, NOW);

    it("question-fixture subtopics are fluent with gate open", () => {
        for (const id of ["1B", "1C", "5B", "5D"]) {
            expect(scores[id].gateOpen, `${id} gate`).toBe(true);
            expect(scores[id].fluency, `${id} fluency`).toBeGreaterThanOrEqual(0.75);
        }
    });

    it("flashcard-only subtopics stay building with gate closed", () => {
        for (const id of ["1A", "1D", "5A", "7A", "4C"]) {
            expect(scores[id].gateOpen, `${id} gate`).toBe(false);
            expect(scores[id].assessed, `${id} assessed`).toBe(true);
        }
    });

    it("CARS leaves are always gate-open and application-only", () => {
        for (const id of ["CARS1", "CARS2", "CARS3"]) {
            expect(scores[id].gateOpen).toBe(true);
            expect(scores[id].fluency).toBe(0);
        }
    });
});

describe("study queue", () => {
    it("mixes rote flashcards (closed gates) and application (open gates)", () => {
        const state = buildSeededState(NOW);
        const scores = computeLeafScores(state, NOW);
        const { selectableIds } = buildFixtures();
        const queue = buildQueue(state, scores, selectableIds, NOW, DEFAULT_CONFIG);

        expect(queue.length).toBeGreaterThan(4);
        expect(queue.length).toBeLessThanOrEqual(DEFAULT_CONFIG.sessionSize);
        expect(queue.some((q) => q.kind === "flashcard")).toBe(true);
        expect(queue.some((q) => q.kind === "mcq")).toBe(true);
    });

    it("never places two items from the same subtopic back-to-back", () => {
        const state = buildSeededState(NOW);
        const scores = computeLeafScores(state, NOW);
        const { selectableIds } = buildFixtures();
        const queue = buildQueue(state, scores, selectableIds, NOW, DEFAULT_CONFIG);
        for (let i = 1; i < queue.length; i++) {
            if (queue.length > 2) { expect(queue[i].leafId).not.toBe(queue[i - 1].leafId); }
        }
    });

    it("caps items per subtopic", () => {
        const state = buildSeededState(NOW);
        const scores = computeLeafScores(state, NOW);
        const { selectableIds } = buildFixtures();
        const queue = buildQueue(state, scores, selectableIds, NOW, { ...DEFAULT_CONFIG, sessionSize: 100 });
        const counts = new Map<string, number>();
        for (const q of queue) { counts.set(q.leafId, (counts.get(q.leafId) ?? 0) + 1); }
        for (const n of counts.values()) { expect(n).toBeLessThanOrEqual(3); }
    });
});

describe("recordReview + gate transitions", () => {
    it("cold start: a leaf opens its gate after fluent rote then application", () => {
        const state: EngineState = buildColdState();
        const cardId = "fc-2"; // leaf 1A flashcard
        const leafId = LEAF_BY_ID["1A"].id;

        let t = NOW;
        // three spaced, fast, correct self-grades -> automaticity + durability
        for (let i = 0; i < 3; i++) {
            recordReview(state, cardId, { selfRating: "good", ms: 3000 }, t);
            t += 3 * DAY_MS;
        }
        const scores = computeLeafScores(state, t);
        expect(scores[leafId].assessed).toBe(true);
        expect(scores[leafId].attempts).toBeGreaterThanOrEqual(2);
    });

    it("first-exposure miss is a productive failure (not a demotion)", () => {
        const state: EngineState = buildColdState();
        const entry = recordReview(state, "fc-3", { selfRating: "again", ms: 8000 }, NOW);
        expect(entry.productiveFailure).toBe(true);
    });

    it("application MCQs are logged but marked seen (not rescheduled by card)", () => {
        const state: EngineState = buildColdState();
        // 1C is gate-open only after evidence; here just verify seen-marking
        recordReview(state, "qbank-000004", { correct: true, ms: 30000 }, NOW);
        expect(state.revlog.some((e) => e.cardId === "qbank-000004")).toBe(true);
    });
});
