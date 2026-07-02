// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { CLIPS } from "./clips";
import { initialModel, makePools, reduce } from "./machine";

const pools = () => makePools(42);

test("reading state is structurally quiet", () => {
    let m = initialModel("spar");
    m = reduce(m, { kind: "fast-correct", trigger: 1 }, pools());
    expect(m.status).toBe("feedback");
    expect(m.queue.length).toBeGreaterThan(0);
    m = reduce(m, { kind: "question", trigger: 2 }, pools());
    expect(m.status).toBe("reading");
    expect(m.queue).toEqual([]);
    expect(CLIPS[m.heroStance].intensity).toBe(1);
    expect(CLIPS[m.oppStance].intensity).toBe(1);
});

test("fast-correct schedules hero strike then matched opponent react", () => {
    const m = reduce(initialModel("spar"), { kind: "fast-correct", trigger: 1 }, pools());
    const hero = m.queue.find((q) => q.who === "hero")!;
    const opp = m.queue.find((q) => q.who === "opp")!;
    expect(hero.clip.startsWith("atk-")).toBe(true);
    expect(opp.atMs).toBeGreaterThan(hero.atMs);
    expect(m.badge?.tone).toBe("gold");
});

test("wrong schedules opponent telegraph then hero hit", () => {
    const m = reduce(initialModel("spar"), { kind: "wrong", trigger: 1 }, pools());
    const opp = m.queue.find((q) => q.who === "opp")!;
    const hero = m.queue.find((q) => q.who === "hero")!;
    expect(opp.atMs).toBe(0);
    expect(hero.atMs).toBeGreaterThanOrEqual(180);
    expect(m.heroStance).toBe("stance-spent");
});

test("bag mode reacts identically for every answer (no leak)", () => {
    const p = pools();
    const a = reduce(initialModel("bag"), { kind: "bag-hit", trigger: 1 }, p);
    expect(a.queue.every((q) => q.who === "hero" || q.who === "bag")).toBe(true);
    expect(a.badge?.tone).toBe("gold"); // same tone regardless of correctness
});

test("a new event replaces the queue (no pile-up behind a fast student)", () => {
    let m = reduce(initialModel("spar"), { kind: "wrong", trigger: 1 }, pools());
    const before = m.queue;
    m = reduce(m, { kind: "fast-correct", trigger: 2 }, pools());
    expect(m.queue).not.toEqual(before);
});
