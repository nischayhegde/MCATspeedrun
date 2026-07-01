// A faithful implementation of the FSRS-5 memory model (the scheduler Anki uses).
// Reference: open-spaced-repetition / FSRS-5. We implement the core equations:
// initial stability/difficulty, retrievability, next interval, and the
// post-review stability/difficulty updates. Tests assert the documented
// invariants rather than exact constants.
import type { FsrsCardState, Grade } from "./model";
import { DAY_MS } from "./model";

// Default FSRS-5 parameters (w0..w18).
export const DEFAULT_W = [
    0.40255,
    1.18385,
    3.173,
    15.69105,
    7.1949,
    0.5345,
    1.4604,
    0.0046,
    1.54575,
    0.1192,
    1.01925,
    1.9395,
    0.11,
    0.29605,
    2.2698,
    0.2315,
    2.9898,
    0.51655,
    0.6621,
] as const;

export const DECAY = -0.5;
export const FACTOR = 19 / 81; // = 0.9^(1/DECAY) - 1, so R(S,S)=0.9

function clampD(d: number): number {
    return Math.min(10, Math.max(1, d));
}
function clampS(s: number): number {
    return Math.min(36500, Math.max(0.01, s));
}

// Retrievability after `elapsedDays` given stability S.
export function retrievability(elapsedDays: number, stability: number, w = DEFAULT_W): number {
    void w;
    const t = Math.max(0, elapsedDays);
    return Math.pow(1 + (FACTOR * t) / stability, DECAY);
}

// Interval (days) to next review to hit requestRetention.
export function nextInterval(stability: number, requestRetention: number): number {
    const i = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
    return Math.max(1, Math.round(i));
}

function initialStability(g: Grade, w = DEFAULT_W): number {
    return clampS(w[g - 1]);
}
function initialDifficulty(g: Grade, w = DEFAULT_W): number {
    return clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
}
function difficultyEasyAnchor(w = DEFAULT_W): number {
    return clampD(w[4] - Math.exp(w[5] * 3) + 1); // D0(Easy)
}

function nextDifficulty(d: number, g: Grade, w = DEFAULT_W): number {
    const deltaD = -w[6] * (g - 3);
    const damped = d + deltaD * ((10 - d) / 9); // linear damping
    const reverted = w[7] * difficultyEasyAnchor(w) + (1 - w[7]) * damped; // mean reversion
    return clampD(reverted);
}

function stabilityAfterRecall(s: number, d: number, r: number, g: Grade, w = DEFAULT_W): number {
    const hardPenalty = g === 2 ? w[15] : 1;
    const easyBonus = g === 4 ? w[16] : 1;
    const inc = 1
        + Math.exp(w[8])
            * (11 - d)
            * Math.pow(s, -w[9])
            * (Math.exp(w[10] * (1 - r)) - 1)
            * hardPenalty
            * easyBonus;
    return clampS(s * inc);
}

function stabilityAfterLapse(s: number, d: number, r: number, w = DEFAULT_W): number {
    const sMin = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
    return clampS(Math.min(sMin, s)); // post-lapse stability never exceeds prior
}

export interface UpdateResult {
    state: FsrsCardState;
    interval: number;
    retrievabilityAtReview: number;
}

// Apply a review of `grade` at `now` (epoch ms) to a card state.
export function updateState(
    prev: FsrsCardState,
    grade: Grade,
    now: number,
    requestRetention: number,
    w = DEFAULT_W,
): UpdateResult {
    let stability: number;
    let difficulty: number;
    let r = 1;

    if (prev.reps === 0) {
        // first exposure
        stability = initialStability(grade, w);
        difficulty = initialDifficulty(grade, w);
    } else {
        const elapsedDays = prev.lastReview ? (now - prev.lastReview) / DAY_MS : 0;
        r = retrievability(elapsedDays, prev.stability, w);
        difficulty = nextDifficulty(prev.difficulty, grade, w);
        stability = grade === 1
            ? stabilityAfterLapse(prev.stability, prev.difficulty, r, w)
            : stabilityAfterRecall(prev.stability, prev.difficulty, r, grade, w);
    }

    const interval = nextInterval(stability, requestRetention);
    const state: FsrsCardState = {
        stability,
        difficulty,
        due: now + interval * DAY_MS,
        lastReview: now,
        reps: prev.reps + 1,
        lapses: prev.lapses + (grade === 1 ? 1 : 0),
        phase: grade === 1 ? "relearning" : "review",
    };
    return { state, interval, retrievabilityAtReview: r };
}

export function newCardState(now: number): FsrsCardState {
    return {
        stability: 0,
        difficulty: 0,
        due: now,
        lastReview: 0,
        reps: 0,
        lapses: 0,
        phase: "new",
    };
}

// Current retrievability of a card at time `now` (1 if never reviewed).
export function currentRetrievability(state: FsrsCardState, now: number, w = DEFAULT_W): number {
    if (state.reps === 0 || !state.lastReview) { return 0; }
    const elapsedDays = (now - state.lastReview) / DAY_MS;
    return retrievability(elapsedDays, state.stability, w);
}
