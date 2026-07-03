// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { BUILD_BULK } from "./geometry";
import { hashId } from "./rng";

export type Species = "rookie" | "sidewinder" | "hobnail" | "howler" | "gravel" | "bullhorn" | "chiron";
export type Build = keyof typeof BUILD_BULK;
export type Chassis = "biped" | "taur";
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export interface Palette {
    skin: string;
    trunks: string;
    glove: string;
    accent: string;
    fur?: string;
}

export interface SpeciesSpec {
    id: Species;
    name: string;
    chassis: Chassis;
    build: Build;
    headPath: string;
    extraPaths: string[];
    palettes: Palette[];
    hitSfx: string;
    amp: number;
    wt: number;
    texture?: "scale" | "fur" | "crack" | "hide" | "warpaint";
}

export interface OpponentInstance {
    species: SpeciesSpec;
    tier: Tier;
    scale: number;
    bulk: number;
    paletteIndex: number;
}

/* Draft head/extra paths — tuned visually in the Task 8 gallery spike.
   All paths live in the 120x150 viewBox, heads centered near (62,40). */
export const SPECIES: Record<Species, SpeciesSpec> = {
    rookie: {
        id: "rookie",
        name: "ROOKIE",
        chassis: "biped",
        build: "lean",
        headPath:
            "M 51 29 C 47 33 46 40 48 46 C 50 51 55 54 61 53 C 68 52 72 46 71 39 C 70 32 64 27 57 28 C 55 28 53 28 51 29 Z",
        extraPaths: ["M 49 27 A 13 13 0 0 1 76 31 L 71 40 A 9 9 0 0 0 53 37 Z"],
        palettes: [
            { skin: "#c9a181", trunks: "#2f3644", glove: "#3a4152", accent: "#8f97a8" },
            { skin: "#a9846a", trunks: "#33465a", glove: "#3d4f61", accent: "#9aa6b8" },
        ],
        hitSfx: "BAP!",
        amp: 1.15,
        wt: 0.9,
        texture: "hide",
    },
    sidewinder: {
        id: "sidewinder",
        name: "SIDEWINDER",
        chassis: "biped",
        build: "fit",
        headPath: "M 50 34 Q 58 26 70 32 Q 76 38 70 48 Q 58 54 50 46 Z",
        extraPaths: [
            "M 48 34 Q 52 12 60 8 Q 68 10 72 20 Q 66 22 62 26 Q 56 30 52 36 Z",
            "M 70 40 Q 79 40 82 45",
        ],
        palettes: [
            { skin: "#33504a", trunks: "#25403f", glove: "#2f4644", accent: "#4f6a63" },
            { skin: "#3a4c45", trunks: "#2a3e44", glove: "#324744", accent: "#576f66" },
        ],
        hitSfx: "SSAK!",
        amp: 1.1,
        wt: 0.95,
        texture: "scale",
    },
    hobnail: {
        id: "hobnail",
        name: "HOBNAIL",
        chassis: "biped",
        build: "heavy",
        headPath:
            "M 49 31 C 51 24 58 20 65 21 C 73 22 78 29 77 38 C 76 46 69 52 61 51 C 53 50 48 44 48 37 C 48 35 48 33 49 31 Z",
        extraPaths: [
            "M 37 65 C 38 53 47 47 55 49 C 58 45 65 45 68 49 C 76 47 84 53 85 65 C 61 60 37 65 37 65 Z",
            "M 46 34 L 33 26 L 47 40 Z",
            "M 76 34 L 89 26 L 75 40 Z",
        ],
        palettes: [
            { skin: "#565b3e", trunks: "#2c3125", glove: "#3d4230", accent: "#6a7050" },
            { skin: "#4c5140", trunks: "#31352b", glove: "#42473a", accent: "#767c5a" },
        ],
        hitSfx: "CRACK!",
        amp: 0.95,
        wt: 1.1,
        texture: "hide",
    },
    howler: {
        id: "howler",
        name: "HOWLER",
        chassis: "biped",
        build: "heavy",
        headPath: "M 48 34 Q 56 25 66 29 L 86 40 Q 78 50 62 52 Q 50 50 48 42 Z",
        extraPaths: ["M 51 27 L 45 12 L 60 22 Z", "M 62 26 L 63 10 L 73 22 Z"],
        palettes: [
            { skin: "#22252c", trunks: "#1c1f28", glove: "#2c303c", accent: "#3f4450", fur: "#3f4450" },
            { skin: "#282c36", trunks: "#22252f", glove: "#333844", accent: "#464c59", fur: "#464c59" },
        ],
        hitSfx: "AWROO!",
        amp: 1.05,
        wt: 1.0,
        texture: "fur",
    },
    gravel: {
        id: "gravel",
        name: "GRAVEL",
        chassis: "biped",
        build: "colossal",
        headPath: "M 50 30 L 76 30 L 78 48 L 48 48 Z",
        extraPaths: ["M 54 34 L 60 44", "M 66 32 L 70 46"],
        palettes: [
            { skin: "#2a2d33", trunks: "#212429", glove: "#33373d", accent: "#8c1019" },
            { skin: "#2f3238", trunks: "#26292e", glove: "#383c42", accent: "#7a0e16" },
        ],
        hitSfx: "THOOM!",
        amp: 0.8,
        wt: 1.25,
        texture: "crack",
    },
    bullhorn: {
        id: "bullhorn",
        name: "BULLHORN",
        chassis: "biped",
        build: "colossal",
        headPath:
            "M 49 31 C 53 22 63 19 71 24 C 78 29 80 39 74 47 L 68 54 C 63 57 58 57 54 54 L 49 48 C 43 41 45 35 49 31 Z",
        extraPaths: [
            "M 51 32 C 39 30 29 23 29 16 C 29 12 32 10 35 12 C 38 18 47 22 56 26 Z",
            "M 71 32 C 83 30 93 23 93 16 C 93 12 90 10 87 12 C 84 18 75 22 66 26 Z",
            "M 58 51 C 62 55 66 51 66 51",
        ],
        palettes: [
            { skin: "#231f20", trunks: "#191617", glove: "#312b2d", accent: "#7a5f28" },
            { skin: "#282324", trunks: "#1e1a1b", glove: "#383133", accent: "#8a6d2f" },
        ],
        hitSfx: "THUD!",
        amp: 0.8,
        wt: 1.25,
        texture: "hide",
    },
    chiron: {
        id: "chiron",
        name: "CHIRON, WARLORD",
        chassis: "taur",
        build: "colossal",
        headPath: "M 52 30 Q 62 22 72 30 Q 76 40 70 48 Q 60 54 52 46 Z",
        extraPaths: [
            "M 52 30 Q 50 12 58 6 Q 62 8 62 18 Q 64 8 70 8 Q 72 16 68 24 Q 64 26 60 28 Q 56 30 52 30 Z",
            "M 53 37 L 71 35 L 71 40 L 53 42 Z",
            "M 55 45 L 69 44 L 69 48 L 56 49 Z",
        ],
        palettes: [
            { skin: "#302520", trunks: "#241b17", glove: "#3c2f27", accent: "#8c1019" },
            { skin: "#362a24", trunks: "#291f1b", glove: "#453630", accent: "#7a0e16" },
        ],
        hitSfx: "BOOM!",
        amp: 0.85,
        wt: 1.2,
        texture: "warpaint",
    },
};

/* The hero fighter: not part of the opponent roster, but shares SpeciesSpec
   so FighterRig can render it identically. Rookie-shaped silhouette (reuses
   the rookie head/headgear paths) in the hero palette. */
export const HERO: SpeciesSpec = {
    id: "rookie",
    name: "YOU",
    chassis: "biped",
    build: "lean",
    headPath: SPECIES.rookie.headPath,
    extraPaths: SPECIES.rookie.extraPaths,
    palettes: [
        { skin: "#e0b088", trunks: "#a3121c", glove: "#c81e2c", accent: "#f5c451" },
    ],
    hitSfx: "POW!",
    amp: 1.0,
    wt: 1.0,
    texture: "hide",
};

export const TIER_SPECIES: Record<Tier, Species[]> = {
    1: ["rookie"],
    2: ["sidewinder"],
    3: ["hobnail"],
    4: ["howler", "gravel"],
    5: ["bullhorn"],
    6: ["chiron"],
};

const TIER_SCALE: Record<Tier, number> = { 1: 0.9, 2: 0.98, 3: 1.06, 4: 1.16, 5: 1.28, 6: 1.35 };

/* Authored difficulty -> base tier, calibrated to the real imported bank:
   ~92% of questions are authored difficulty 1-2 (diff 3+ is rare, 5 absent),
   so a linear 1:1 map made nearly every opponent the rookie. Low bands are
   additionally fanned across the neighboring tier per card (see opponentFor)
   so the ring stays varied; 4-5 remain boss-tier. */
const AUTHORED_TIER: Record<number, Tier> = { 1: 1, 2: 3, 3: 5, 4: 6, 5: 6 };

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

// Personal-difficulty nudge: untagged (0) is neutral, extremes shift a tier.
function fsrsTierMod(fsrs: number): number {
    if (fsrs === 0) {
        return 0;
    }
    if (fsrs >= 7.5) {
        return 1;
    }
    if (fsrs <= 3.5) {
        return -1;
    }
    return 0;
}

export function tierFor(authored: number, fsrs: number, tagged: boolean): Tier {
    const base = tagged || fsrs === 0
        ? AUTHORED_TIER[clamp(authored, 1, 5)]
        : clamp(Math.round(1 + ((fsrs - 1) / 9) * 4), 1, 5);
    return clamp(base + fsrsTierMod(fsrs), 1, 6) as Tier;
}

export function opponentFor(
    item: { cardId: bigint; difficulty: number; fsrsDifficulty: number; difficultyTagged: boolean },
    cache: Map<string, Tier>,
): OpponentInstance {
    const key = String(item.cardId);
    let tier = cache.get(key);
    if (tier === undefined) {
        tier = tierFor(item.difficulty, item.fsrsDifficulty, item.difficultyTagged);
        // fan the dominant low-difficulty bands across the neighboring tier,
        // deterministically per card, so the roster stays varied
        if (item.difficultyTagged && item.difficulty <= 2) {
            tier = clamp(tier + (hashId(item.cardId, 3) % 2), 1, 6) as Tier;
        }
        cache.set(key, tier); // frozen per card per session — no mid-session thrash
    }
    const pool = TIER_SPECIES[tier];
    const pick = pool[hashId(item.cardId, 1) % pool.length];
    const species = SPECIES[pick];
    const paletteIndex = hashId(item.cardId, 2) % species.palettes.length;
    // within-band interpolation: personally-harder cards read bulkier
    const eff = item.fsrsDifficulty > 0 ? (item.fsrsDifficulty - 5.5) / 9 : 0;
    const bulk = clamp(BUILD_BULK[species.build] + eff * 0.25, 0, 1);
    return { species, tier, scale: TIER_SCALE[tier], bulk, paletteIndex };
}

export function tierFromMastery(weakness: number): Tier {
    return clamp(Math.ceil(clamp(weakness, 0, 1) * 6), 1, 6) as Tier;
}

export function heroBulk(readinessPct: number): number {
    if (readinessPct >= 70) {
        return 0.7;
    }
    if (readinessPct >= 40) {
        return 0.35;
    }
    return 0;
}
