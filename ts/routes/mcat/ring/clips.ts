// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

export interface ClipDef {
    id: string;
    durMs: number;
    intensity: 1 | 2 | 3;
    badge?: { text: string; tone: "gold" | "steel" | "err" };
    shake?: 0 | 1 | 2 | 3;
}

const c = (
    id: string, durMs: number, intensity: 1 | 2 | 3,
    badge?: ClipDef["badge"], shake?: ClipDef["shake"],
): ClipDef => ({ id, durMs, intensity, badge, shake });

export const CLIPS: Record<string, ClipDef> = Object.fromEntries(
    [
        // loops (intensity 1 = reading-safe)
        c("stance-guard", 2900, 1),
        c("stance-bounce", 1800, 2),
        c("stance-jumprope", 520, 1),
        c("stance-spent", 3200, 1),
        c("bag-sway", 4500, 1),
        // hero power (fast-correct)
        c("atk-cross", 560, 3, { text: "POW!", tone: "gold" }, 2),
        c("atk-uppercut", 620, 3, { text: "BAM!", tone: "gold" }, 2),
        c("atk-hook", 580, 3, { text: "WHAM!", tone: "gold" }, 2),
        // hero counters (slow-correct)
        c("ctr-slip-jab", 640, 3, { text: "POINT!", tone: "gold" }, 1),
        c("ctr-block-hook", 700, 3, { text: "POINT!", tone: "gold" }, 1),
        // hero hit reactions (wrong)
        c("hit-head-snap", 480, 3, { text: "OOF!", tone: "err" }, 1),
        c("hit-gut-fold", 560, 3, { text: "OOF!", tone: "err" }, 1),
        c("hit-stagger", 640, 3, { text: "OOF!", tone: "err" }, 1),
        // IDK
        c("def-step-back", 600, 2, { text: "GOOD CALL", tone: "steel" }),
        // opponent shared core
        c("opp-atk-jab", 420, 3),
        c("opp-atk-cross", 520, 3),
        c("opp-hit-head-snap", 480, 3),
        c("opp-hit-gut-fold", 560, 3),
        c("opp-hit-stagger-ropes", 640, 3),
        c("opp-block", 500, 2),
        c("opp-taunt-respect-nod", 700, 2),
        // bag strikes (diagnostic + flashcard training beats)
        c("bag-jab", 340, 2, { text: "POW!", tone: "gold" }),
        c("bag-cross", 500, 2, { text: "BAM!", tone: "gold" }),
        c("bag-hook", 520, 2, { text: "WHAM!", tone: "gold" }),
        c("bag-uppercut", 550, 2, { text: "BOOM!", tone: "gold" }),
        // results
        c("win-arms-up", 1200, 3, undefined, 2),
        c("draw-glove-touch", 900, 2),
        c("loss-towel-nod", 1100, 2),
    ].map((d) => [d.id, d]),
);

export type PoolName = "power" | "counter" | "heroHit" | "oppAttack" | "bag";

export const POOLS: Record<PoolName, string[]> = {
    power: ["atk-cross", "atk-uppercut", "atk-hook"],
    counter: ["ctr-slip-jab", "ctr-block-hook"],
    heroHit: ["hit-head-snap", "hit-gut-fold", "hit-stagger"],
    oppAttack: ["opp-atk-jab", "opp-atk-cross"],
    bag: ["bag-jab", "bag-cross", "bag-hook", "bag-uppercut"],
};

/** Opponent reaction matched to the hero strike that landed. */
export const MATCHED_REACT: Record<string, string> = {
    "atk-cross": "opp-hit-stagger-ropes",
    "atk-uppercut": "opp-hit-head-snap",
    "atk-hook": "opp-hit-stagger-ropes",
    "ctr-slip-jab": "opp-hit-head-snap",
    "ctr-block-hook": "opp-hit-gut-fold",
};
