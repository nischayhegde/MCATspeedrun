// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { CLIPS, MATCHED_REACT, type PoolName, POOLS } from "./clips";
import { mulberry32, ShuffleBag } from "./rng";

export type RingStatus = "reading" | "feedback" | "results";
export type FightEventKind =
    | "question"
    | "fast-correct"
    | "slow-correct"
    | "wrong"
    | "idk"
    | "rate-again"
    | "rate-hard"
    | "rate-good"
    | "rate-easy"
    | "bag-hit"
    | "results-win"
    | "results-draw"
    | "results-loss";

export interface FightEvent {
    kind: FightEventKind;
    trigger: number;
}
export interface ScheduledClip {
    who: "hero" | "opp" | "bag";
    clip: string;
    atMs: number;
}
export interface RingModel {
    status: RingStatus;
    heroStance: string;
    oppStance: string;
    queue: ScheduledClip[];
    badge: { text: string; tone: "gold" | "steel" | "err" } | null;
    shake: 0 | 1 | 2 | 3;
}

export function makePools(seed: number): { next(pool: PoolName): string } {
    const rng = mulberry32(seed);
    const bags = Object.fromEntries(
        (Object.keys(POOLS) as PoolName[]).map((k) => [k, new ShuffleBag(POOLS[k], rng)]),
    ) as Record<PoolName, ShuffleBag<string>>;
    return { next: (pool) => bags[pool].next() };
}

export function initialModel(mode: "spar" | "train" | "bag"): RingModel {
    return {
        status: "reading",
        heroStance: mode === "train" ? "stance-jumprope" : "stance-guard",
        oppStance: "stance-guard",
        queue: [],
        badge: null,
        shake: 0,
    };
}

const quiet = (stance: string): string => CLIPS[stance] && CLIPS[stance].intensity === 1 ? stance : "stance-guard";

export function reduce(
    model: RingModel,
    ev: FightEvent,
    pools: { next(pool: PoolName): string },
): RingModel {
    const next: RingModel = { ...model, queue: [], badge: null, shake: 0 };
    switch (ev.kind) {
        case "question": {
            // STRUCTURAL guarantee: reading holds no queue and only intensity-1 stances.
            next.status = "reading";
            next.heroStance = quiet(model.heroStance === "stance-jumprope" ? "stance-jumprope" : "stance-guard");
            next.oppStance = "stance-guard";
            return next;
        }
        case "fast-correct":
        case "slow-correct": {
            const strike = pools.next(ev.kind === "fast-correct" ? "power" : "counter");
            next.status = "feedback";
            next.heroStance = "stance-bounce";
            next.queue = [
                { who: "hero", clip: strike, atMs: 0 },
                { who: "opp", clip: MATCHED_REACT[strike] ?? "opp-hit-head-snap", atMs: 180 },
            ];
            next.badge = CLIPS[strike].badge ?? null;
            next.shake = CLIPS[strike].shake ?? 0;
            return next;
        }
        case "wrong": {
            const attack = pools.next("oppAttack");
            const hit = pools.next("heroHit");
            next.status = "feedback";
            next.heroStance = "stance-spent";
            next.queue = [
                { who: "opp", clip: attack, atMs: 0 }, // telegraph is inside the clip
                { who: "hero", clip: hit, atMs: 220 },
            ];
            next.badge = CLIPS[hit].badge ?? null;
            next.shake = 1;
            return next;
        }
        case "idk": {
            next.status = "feedback";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip: "def-step-back", atMs: 0 },
                { who: "opp", clip: "opp-taunt-respect-nod", atMs: 250 },
            ];
            next.badge = CLIPS["def-step-back"].badge ?? null;
            return next;
        }
        case "rate-again":
        case "rate-hard":
        case "rate-good":
        case "rate-easy": {
            const map = {
                "rate-again": "bag-jab",
                "rate-hard": "bag-cross",
                "rate-good": "bag-hook",
                "rate-easy": "bag-uppercut",
            } as const;
            const clip = map[ev.kind];
            next.status = "feedback";
            next.heroStance = "stance-jumprope";
            next.queue = [
                { who: "hero", clip, atMs: 0 },
                { who: "bag", clip: `swing-${clip}`, atMs: 120 },
            ];
            next.badge = CLIPS[clip].badge ?? null;
            return next;
        }
        case "bag-hit": {
            const clip = pools.next("bag");
            next.status = "feedback";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip, atMs: 0 },
                { who: "bag", clip: `swing-${clip}`, atMs: 120 },
            ];
            next.badge = CLIPS[clip].badge ?? null; // uniform gold — zero leak
            return next;
        }
        case "results-win":
        case "results-draw":
        case "results-loss": {
            const map = {
                "results-win": ["win-arms-up", "opp-hit-stagger-ropes"],
                "results-draw": ["draw-glove-touch", "opp-taunt-respect-nod"],
                "results-loss": ["loss-towel-nod", "opp-taunt-respect-nod"],
            } as const;
            const [hero, opp] = map[ev.kind];
            next.status = "results";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip: hero, atMs: 0 },
                { who: "opp", clip: opp, atMs: 200 },
            ];
            next.shake = CLIPS[hero].shake ?? 0;
            return next;
        }
    }
}
