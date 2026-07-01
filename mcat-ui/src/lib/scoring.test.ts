import { describe, expect, it } from "vitest";
import { clamp01, confidence, emptyLeafState, gradeMcq, masteryOf, readiness } from "./scoring";
import { LEAF_BY_ID, LEAVES } from "./taxonomy";
import type { LeafState } from "./types";

function statesWith(fn: (id: string) => Partial<LeafState>): Record<string, LeafState> {
    const out: Record<string, LeafState> = {};
    for (const leaf of LEAVES) { out[leaf.id] = { ...emptyLeafState(leaf.id), ...fn(leaf.id) }; }
    return out;
}

describe("taxonomy weights", () => {
    it("sum to ~1 across all leaves", () => {
        const sum = LEAVES.reduce((a, l) => a + l.weight, 0);
        expect(sum).toBeCloseTo(1, 6);
    });
    it("has 34 leaves (31 CCs + 3 CARS skills)", () => {
        expect(LEAVES.length).toBe(34);
        expect(LEAVES.filter((l) => l.isCars).length).toBe(3);
    });
});

describe("gradeMcq", () => {
    it("wrong -> again", () => {
        expect(gradeMcq(false, 5000, "application").rating).toBe("again");
    });
    it("correct + fast -> easy", () => {
        expect(gradeMcq(true, 1000, "application").rating).toBe("easy");
    });
    it("correct + slow -> hard", () => {
        expect(gradeMcq(true, 999999, "application").rating).toBe("hard");
    });
    it("correct + normal -> good", () => {
        expect(gradeMcq(true, 80000, "application").rating).toBe("good");
    });
});

describe("masteryOf", () => {
    it("CARS uses application only", () => {
        const cars = LEAF_BY_ID["CARS1"];
        const s = { ...emptyLeafState("CARS1"), fluency: 1, application: 0.5 };
        expect(masteryOf(cars, s)).toBeCloseTo(0.5, 6);
    });
    it("content category blends 0.4 fluency + 0.6 application", () => {
        const cc = LEAF_BY_ID["1A"];
        const s = { ...emptyLeafState("1A"), fluency: 1, application: 0 };
        expect(masteryOf(cc, s)).toBeCloseTo(0.4, 6); // fluent-not-applied
    });
});

describe("readiness", () => {
    it("all-zero -> 472 / 0%", () => {
        const r = readiness(statesWith(() => ({})));
        expect(r.pct).toBeCloseTo(0, 6);
        expect(r.score).toBe(472);
    });
    it("all-mastered -> 528 / 100%", () => {
        const r = readiness(statesWith(() => ({ fluency: 1, application: 1 })));
        expect(r.pct).toBeCloseTo(100, 6);
        expect(r.score).toBe(528);
    });
});

describe("confidence", () => {
    it("unassessed -> 0", () => {
        expect(confidence(statesWith(() => ({}))).pct).toBeCloseTo(0, 6);
    });
    it("increases with more evidence", () => {
        const low = confidence(statesWith(() => ({ assessed: true, attempts: 1, freshness: 1 })));
        const high = confidence(statesWith(() => ({ assessed: true, attempts: 10, freshness: 1 })));
        expect(high.pct).toBeGreaterThan(low.pct);
    });
    it("full evidence -> ~100% and small band", () => {
        const c = confidence(statesWith(() => ({ assessed: true, attempts: 10, freshness: 1 })));
        expect(c.pct).toBeCloseTo(100, 5);
        expect(c.band).toBeLessThanOrEqual(2);
    });
});

describe("clamp01", () => {
    it("clamps", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(2)).toBe(1);
        expect(clamp01(0.5)).toBe(0.5);
    });
});
