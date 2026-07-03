// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { HERO, heroBulk, opponentFor, SPECIES, type Tier, tierFor, tierFromMastery } from "./roster";

test("tierFor maps authored difficulty through the content-calibrated table", () => {
    expect(tierFor(3, 0, true)).toBe(5); // rare diff-3 -> boss-adjacent
    expect(tierFor(5, 8.0, true)).toBe(6); // authored 5 + brutal -> centaur
    expect(tierFor(5, 5.0, true)).toBe(6);
    expect(tierFor(2, 2.0, true)).toBe(2); // easy for you -> -1
    expect(tierFor(3, 9.9, false)).toBe(6); // untagged: fsrs-only base 5, +1 mod
    expect(tierFor(1, 0, false)).toBe(1);
});

test("low-difficulty cards fan out across neighboring tiers", () => {
    const tiers = new Set(
        [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n].map(
            (cardId) =>
                opponentFor(
                    { cardId, difficulty: 1, fsrsDifficulty: 0, difficultyTagged: true },
                    new Map(),
                ).tier,
        ),
    );
    expect(tiers.size).toBeGreaterThan(1); // not every diff-1 card is the rookie
});

test("opponent identity is deterministic and tier is frozen per session", () => {
    const cache = new Map<string, Tier>();
    const item = { cardId: 999n, difficulty: 4, fsrsDifficulty: 0, difficultyTagged: true };
    const a = opponentFor(item, cache);
    const b = opponentFor({ ...item, fsrsDifficulty: 9.9 }, cache); // fsrs moved mid-session
    expect(a.species.id).toBe(b.species.id); // frozen
    expect(a.paletteIndex).toBe(b.paletteIndex);
});

test("authored 4+ is boss-tier: chiron the warlord", () => {
    const cache = new Map<string, Tier>();
    const boss = opponentFor({ cardId: 1n, difficulty: 4, fsrsDifficulty: 0, difficultyTagged: true }, cache);
    expect(boss.species.id).toBe("chiron");
});

test("hero bulk steps at readiness 40/70", () => {
    expect(heroBulk(10)).toBe(0);
    expect(heroBulk(50)).toBe(0.35);
    expect(heroBulk(80)).toBe(0.7);
});

test("dashboard mastery mapping covers all tiers", () => {
    expect(tierFromMastery(0)).toBe(1);
    expect(tierFromMastery(1)).toBe(6);
});

test("all seven species exist with heads and palettes", () => {
    for (const s of Object.values(SPECIES)) {
        expect(s.headPath.length).toBeGreaterThan(10);
        expect(s.palettes.length).toBeGreaterThanOrEqual(2);
    }
});

test("HERO carries the hero palette", () => {
    expect(HERO.palettes[0].glove).toBe("#c81e2c");
});

test("every species declares a material texture", () => {
    for (const s of Object.values(SPECIES)) {
        expect(s.texture).toBeDefined();
    }
});
