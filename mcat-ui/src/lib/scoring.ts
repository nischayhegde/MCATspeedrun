// Pure scoring logic for the MCAT study app prototype.
// Mirrors the PRD: auto-grade mapping, fluency/application, gate + implication,
// readiness (blueprint-weighted mastery) and the v1 confidence heuristic.
import { type Leaf, LEAVES } from "./taxonomy";
import type { LeafState, Rating } from "./types";

export const N_TARGET = 5; // spaced recalls for full evidence depth
export const R_TARGET = 0.9; // desired retrievability
export const FLUENCY_THRESHOLD = 0.75; // fluency gate opens at/above this

export function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
}

// Per-broad-type latency thresholds (ms). PLACEHOLDER calibration (see PRD).
export const LATENCY = {
    flashcard: { fast: 6000, slow: 15000 },
    discrete: { fast: 45000, slow: 90000 },
    application: { fast: 60000, slow: 120000 },
    cars: { fast: 70000, slow: 140000 },
} as const;

export type ItemKind = keyof typeof LATENCY;

export interface GradeResult {
    rating: Rating;
    fast: boolean;
    slow: boolean;
    correct: boolean;
}

// Auto-grade an objective (MCQ) item from correctness + time.
export function gradeMcq(correct: boolean, ms: number, kind: ItemKind): GradeResult {
    const t = LATENCY[kind];
    if (!correct) { return { rating: "again", fast: false, slow: ms >= t.slow, correct: false }; }
    if (ms <= t.fast) { return { rating: "easy", fast: true, slow: false, correct: true }; }
    if (ms >= t.slow) { return { rating: "hard", fast: false, slow: true, correct: true }; }
    return { rating: "good", fast: false, slow: false, correct: true };
}

export function emptyLeafState(id: string): LeafState {
    return { id, fluency: 0, application: 0, attempts: 0, freshness: 0, assessed: false, gateOpen: false };
}

// Mastery m_i in [0,1]. Application-weighted; CARS is application-only.
export function masteryOf(leaf: Leaf, s: LeafState | undefined): number {
    if (!s) { return 0; }
    if (leaf.isCars) { return clamp01(s.application); }
    return clamp01(0.4 * s.fluency + 0.6 * s.application);
}

export interface Readiness {
    pct: number; // 0..100
    score: number; // 472..528
}

export function readiness(states: Record<string, LeafState>): Readiness {
    let num = 0;
    let den = 0;
    for (const leaf of LEAVES) {
        num += leaf.weight * masteryOf(leaf, states[leaf.id]);
        den += leaf.weight;
    }
    const pct = den ? (num / den) * 100 : 0;
    const score = Math.round(472 + (pct / 100) * (528 - 472));
    return { pct, score };
}

export interface Confidence {
    pct: number; // 0..100
    coverage: number;
    depth: number;
    freshness: number;
    band: number; // +/- points on the 472..528 scale
}

// v1 heuristic: geometric mean of coverage, depth, freshness.
export function confidence(states: Record<string, LeafState>): Confidence {
    let wSum = 0;
    let cov = 0;
    let depth = 0;
    let fresh = 0;
    for (const leaf of LEAVES) {
        const s = states[leaf.id];
        wSum += leaf.weight;
        cov += leaf.weight * (s?.assessed ? 1 : 0);
        depth += leaf.weight * Math.min(1, (s?.attempts ?? 0) / N_TARGET);
        fresh += leaf.weight * (s?.assessed ? s.freshness : 0);
    }
    const coverage = wSum ? cov / wSum : 0;
    const d = wSum ? depth / wSum : 0;
    const f = wSum ? fresh / wSum : 0;
    const c = Math.cbrt(coverage * d * f);
    const band = Math.round((1 - c) * 15) + 1;
    return { pct: c * 100, coverage, depth: d, freshness: f, band };
}

// NOTE: per-attempt evidence accumulation and the fluency gate now live in the
// engine (engine/grade.ts + engine/aggregate.ts), driven by the review log +
// FSRS states. The old heuristic applyAttempt/computeGateOpen were removed.
