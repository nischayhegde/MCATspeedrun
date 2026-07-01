import { describe, expect, it } from "vitest";
import { currentRetrievability, newCardState, nextInterval, retrievability, updateState } from "./fsrs";
import { DAY_MS } from "./model";

const RR = 0.9;
const T0 = 1_000_000_000_000;

describe("retrievability", () => {
    it("is 1 at t=0 and decreases with time", () => {
        expect(retrievability(0, 10)).toBeCloseTo(1, 6);
        expect(retrievability(10, 10)).toBeLessThan(1);
        expect(retrievability(100, 10)).toBeLessThan(retrievability(10, 10));
    });
    it("equals ~0.9 at t = stability (by construction)", () => {
        expect(retrievability(10, 10)).toBeCloseTo(0.9, 2);
    });
});

describe("nextInterval", () => {
    it("grows with stability", () => {
        expect(nextInterval(20, RR)).toBeGreaterThan(nextInterval(5, RR));
    });
    it("is at least 1 day", () => {
        expect(nextInterval(0.01, RR)).toBeGreaterThanOrEqual(1);
    });
});

describe("updateState", () => {
    it("initializes stability/difficulty on first review; Easy > Again", () => {
        const again = updateState(newCardState(T0), 1, T0, RR).state;
        const easy = updateState(newCardState(T0), 4, T0, RR).state;
        expect(again.reps).toBe(1);
        expect(easy.stability).toBeGreaterThan(again.stability);
    });

    it("a spaced Good review increases stability", () => {
        const s1 = updateState(newCardState(T0), 3, T0, RR).state;
        const s2 = updateState(s1, 3, s1.due, RR).state; // review when due
        expect(s2.stability).toBeGreaterThan(s1.stability);
        expect(s2.reps).toBe(2);
    });

    it("a lapse (Again) drops stability and increments lapses", () => {
        const s1 = updateState(newCardState(T0), 4, T0, RR).state; // strong
        const s2 = updateState(s1, 3, s1.due, RR).state;
        const lapsed = updateState(s2, 1, s2.due, RR).state;
        expect(lapsed.stability).toBeLessThanOrEqual(s2.stability);
        expect(lapsed.lapses).toBe(1);
        expect(lapsed.phase).toBe("relearning");
    });

    it("difficulty rises after Again and falls after Easy", () => {
        const base = updateState(newCardState(T0), 3, T0, RR).state;
        const harder = updateState(base, 1, base.due, RR).state;
        const easier = updateState(base, 4, base.due, RR).state;
        expect(harder.difficulty).toBeGreaterThan(base.difficulty);
        expect(easier.difficulty).toBeLessThan(base.difficulty);
    });

    it("schedules the next due in the future", () => {
        const s1 = updateState(newCardState(T0), 3, T0, RR).state;
        expect(s1.due).toBeGreaterThan(T0);
    });
});

describe("currentRetrievability", () => {
    it("is 0 for a never-reviewed card and ~high right after review", () => {
        expect(currentRetrievability(newCardState(T0), T0)).toBe(0);
        const s1 = updateState(newCardState(T0), 3, T0, RR).state;
        expect(currentRetrievability(s1, T0 + DAY_MS)).toBeGreaterThan(0.5);
    });
});
