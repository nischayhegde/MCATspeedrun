// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { BUILD_BULK } from "./geometry";
import { hashId } from "./rng";

export type Species =
    | "rookie" | "sidewinder" | "hobnail" | "howler" | "gravel" | "bullhorn" | "chiron";
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
        id: "rookie", name: "ROOKIE", chassis: "biped", build: "lean",
        headPath: "M 52 30 A 11 11 0 1 1 52 52 A 12 13 0 0 1 52 30 Z",
        extraPaths: ["M 50 28 A 13 13 0 0 1 76 32 L 72 40 A 9 9 0 0 0 54 38 Z"], // headgear dome
        palettes: [
            { skin: "#c9a181", trunks: "#3d4657", glove: "#4a5262", accent: "#566073" },
            { skin: "#a9846a", trunks: "#42556a", glove: "#4a5262", accent: "#5d6b80" },
        ],
        hitSfx: "BAP!", amp: 1.15, wt: 0.9,
    },
    sidewinder: {
        id: "sidewinder", name: "SIDEWINDER", chassis: "biped", build: "fit",
        headPath: "M 50 34 Q 58 26 70 32 Q 76 38 70 48 Q 58 54 50 46 Z",
        // tall, long front-to-back sail crest reading at a squint + snout hint
        extraPaths: [
            "M 48 34 Q 52 12 60 8 Q 68 10 72 20 Q 66 22 62 26 Q 56 30 52 36 Z",
            "M 70 40 Q 79 40 82 45",
        ],
        palettes: [
            { skin: "#3f5c54", trunks: "#2e4a4a", glove: "#37504e", accent: "#5f7a72" },
            { skin: "#46584f", trunks: "#33484f", glove: "#3a4f52", accent: "#67806f" },
        ],
        hitSfx: "SSAK!", amp: 1.1, wt: 0.95,
    },
    hobnail: {
        id: "hobnail", name: "HOBNAIL", chassis: "biped", build: "heavy",
        headPath: "M 50 32 Q 62 24 74 32 Q 78 42 72 50 Q 60 56 50 48 Z",
        // hunched trapezius hump rising behind the neck + bold ear points
        extraPaths: [
            "M 38 66 Q 39 54 48 49 Q 55 46 62 51 Q 69 46 76 49 Q 85 54 86 66 Q 62 61 38 66 Z",
            "M 47 35 L 35 27 L 48 41 Z",
            "M 75 35 L 87 27 L 74 41 Z",
        ],
        palettes: [
            { skin: "#6a6f4e", trunks: "#3a4030", glove: "#4c523c", accent: "#7c825e" },
            { skin: "#5e6549", trunks: "#3f4436", glove: "#50563f", accent: "#878c66" },
        ],
        hitSfx: "CRACK!", amp: 0.95, wt: 1.1,
    },
    howler: {
        id: "howler", name: "HOWLER", chassis: "biped", build: "heavy",
        // elongated wolf muzzle protruding to the front
        headPath: "M 48 34 Q 56 25 66 29 L 86 40 Q 78 50 62 52 Q 50 50 48 42 Z",
        // larger upright wolf ears
        extraPaths: ["M 51 27 L 45 12 L 60 22 Z", "M 62 26 L 63 10 L 73 22 Z"],
        palettes: [
            { skin: "#2b2f38", trunks: "#232732", glove: "#343947", accent: "#4a4f5c", fur: "#4a4f5c" },
            { skin: "#31353f", trunks: "#282c37", glove: "#3a3f4d", accent: "#525866", fur: "#525866" },
        ],
        hitSfx: "AWROO!", amp: 1.05, wt: 1.0,
    },
    gravel: {
        id: "gravel", name: "GRAVEL", chassis: "biped", build: "colossal",
        headPath: "M 50 30 L 76 30 L 78 48 L 48 48 Z",
        extraPaths: ["M 54 34 L 60 44", "M 66 32 L 70 46"], // crack seams (accent stroke)
        palettes: [
            { skin: "#33363d", trunks: "#2a2d33", glove: "#3d4148", accent: "#a3121c" },
            { skin: "#383b42", trunks: "#2e3138", glove: "#42464e", accent: "#8c1019" },
        ],
        hitSfx: "THOOM!", amp: 0.8, wt: 1.25,
    },
    bullhorn: {
        id: "bullhorn", name: "BULLHORN", chassis: "biped", build: "colossal",
        headPath: "M 50 32 Q 62 22 74 32 Q 78 44 70 52 L 66 56 Q 62 58 58 56 L 54 52 Q 46 44 50 32 Z",
        extraPaths: [
            // WIDE horn span: thick at the temples, sweeping outward-and-up well
            // past the head, with upturned tips (total span ~2.5x head width)
            "M 52 33 Q 40 31 30 24 Q 22 18 24 11 Q 30 17 39 21 Q 48 25 55 29 Z",
            "M 72 33 Q 84 31 94 24 Q 102 18 100 11 Q 94 17 85 21 Q 76 25 69 29 Z",
            "M 58 50 Q 62 54 66 50", // snout ring line
        ],
        palettes: [
            { skin: "#262223", trunks: "#1d1a1b", glove: "#3a3336", accent: "#8a6d2f" },
            { skin: "#2c2628", trunks: "#221e20", glove: "#413a3d", accent: "#9b7c38" },
        ],
        hitSfx: "THUD!", amp: 0.8, wt: 1.25,
    },
    chiron: {
        id: "chiron", name: "CHIRON, WARLORD", chassis: "taur", build: "colossal",
        headPath: "M 52 30 Q 62 22 72 30 Q 76 40 70 48 Q 60 54 52 46 Z",
        // bold red mohawk mane + thick war-paint stripes across the face
        extraPaths: [
            "M 52 30 Q 50 12 58 6 Q 62 8 62 18 Q 64 8 70 8 Q 72 16 68 24 Q 64 26 60 28 Q 56 30 52 30 Z",
            "M 53 37 L 71 35 L 71 40 L 53 42 Z",
            "M 55 45 L 69 44 L 69 48 L 56 49 Z",
        ],
        palettes: [
            { skin: "#3a2d26", trunks: "#2b211c", glove: "#4a3a30", accent: "#a3121c" },
            { skin: "#41332b", trunks: "#302620", glove: "#524139", accent: "#8c1019" },
        ],
        hitSfx: "BOOM!", amp: 0.85, wt: 1.2,
    },
};

export const TIER_SPECIES: Record<Tier, Species[]> = {
    1: ["rookie"], 2: ["sidewinder"], 3: ["hobnail"],
    4: ["howler", "gravel"], 5: ["bullhorn"], 6: ["chiron"],
};

/* Wave 1 ships rookie/hobnail/bullhorn; others degrade to nearest silhouette. */
const WAVE1_SHIPPED: Set<Species> = new Set(["rookie", "hobnail", "bullhorn"]);
const WAVE1_FALLBACK: Record<Species, Species> = {
    rookie: "rookie", sidewinder: "rookie", hobnail: "hobnail",
    howler: "hobnail", gravel: "hobnail", bullhorn: "bullhorn", chiron: "bullhorn",
};

const TIER_SCALE: Record<Tier, number> = { 1: 0.9, 2: 0.98, 3: 1.06, 4: 1.16, 5: 1.28, 6: 1.35 };

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function tierFor(authored: number, fsrs: number, tagged: boolean): Tier {
    const base = tagged || fsrs === 0
        ? clamp(authored, 1, 5)
        : clamp(Math.round(1 + ((fsrs - 1) / 9) * 4), 1, 5);
    const mod = fsrs === 0 ? 0 : fsrs >= 7.5 ? 1 : fsrs <= 3.5 ? -1 : 0;
    return clamp(base + mod, 1, 6) as Tier;
}

export function opponentFor(
    item: { cardId: bigint; difficulty: number; fsrsDifficulty: number; difficultyTagged: boolean },
    cache: Map<string, Tier>,
): OpponentInstance {
    const key = String(item.cardId);
    let tier = cache.get(key);
    if (tier === undefined) {
        tier = tierFor(item.difficulty, item.fsrsDifficulty, item.difficultyTagged);
        cache.set(key, tier); // frozen per card per session — no mid-session thrash
    }
    const pool = TIER_SPECIES[tier];
    const pick = pool[hashId(item.cardId, 1) % pool.length];
    const species = SPECIES[WAVE1_SHIPPED.has(pick) ? pick : WAVE1_FALLBACK[pick]];
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
    return readinessPct >= 70 ? 0.7 : readinessPct >= 40 ? 0.35 : 0;
}
