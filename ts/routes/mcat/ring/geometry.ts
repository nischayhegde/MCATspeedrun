// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

export type JointName =
    | "root" | "pelvis" | "spine" | "chest" | "neck" | "head"
    | "armFront" | "forearmFront" | "armBack" | "forearmBack"
    | "legFront" | "shinFront" | "legBack" | "shinBack";

export const BUILD_BULK = { lean: 0, fit: 0.35, heavy: 0.7, colossal: 1 } as const;

const fmt = (n: number): string => n.toFixed(2);

/** Closed tapered capsule from (x1,y1,r1) to (x2,y2,r2). */
export function capsulePath(
    x1: number, y1: number, r1: number,
    x2: number, y2: number, r2: number,
): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // sweep-flag 0: with n = d rotated +90° in y-down coords, the outward cap is the negative-angle arc for both ends.
    return [
        `M ${fmt(x1 + nx * r1)} ${fmt(y1 + ny * r1)}`,
        `L ${fmt(x2 + nx * r2)} ${fmt(y2 + ny * r2)}`,
        `A ${fmt(r2)} ${fmt(r2)} 0 0 0 ${fmt(x2 - nx * r2)} ${fmt(y2 - ny * r2)}`,
        `L ${fmt(x1 - nx * r1)} ${fmt(y1 - ny * r1)}`,
        `A ${fmt(r1)} ${fmt(r1)} 0 0 0 ${fmt(x1 + nx * r1)} ${fmt(y1 + ny * r1)}`,
        "Z",
    ].join(" ");
}

/** Anatomical pivots in the 120x150 viewBox. Shoulders/hips spread with bulk
 * so pivots always sit exactly on the joints the paths are built from. */
export function joints(bulk: number): Record<JointName, [number, number]> {
    const sh = 16 + 3 * bulk; // shoulder half-span from spine x=60
    return {
        root: [60, 150],
        pelvis: [60, 92],
        spine: [60, 90],
        chest: [60, 68],
        neck: [62, 52],
        head: [62, 46],
        armFront: [60 + sh, 66],
        forearmFront: [60 + sh + 8, 84],
        armBack: [60 - sh, 66],
        forearmBack: [60 - sh - 8, 84],
        legFront: [72, 96],
        shinFront: [74, 122],
        legBack: [48, 96],
        shinBack: [46, 122],
    };
}

/* limb radii: [proximal, distal] at bulk 0; widened non-uniformly with bulk */
const LIMB_R = {
    arm: [4.4, 3.4],
    forearm: [3.6, 2.6],
    leg: [5.2, 4.0],
    shin: [4.2, 3.0],
    neck: [3.0, 3.0],
} as const;
const widen = (r: number, bulk: number, f: number): number => r * (1 + f * bulk);

/* 4 drawn torso silhouettes (lean taper -> colossal trapezius hump) */
const TORSOS = [
    "M 47 68 C 48 60 54 55 60 55 C 66 55 72 60 73 68 L 71 90 C 68 93 52 93 49 90 Z",
    "M 45 68 C 46 58 53 54 60 54 C 67 54 74 58 75 68 L 72 90 C 68 94 52 94 48 90 Z",
    "M 42 69 C 43 57 52 52 60 52 C 68 52 77 57 78 69 L 73 91 C 68 95 52 95 47 91 Z",
    "M 39 70 C 40 55 50 48 60 48 C 70 48 80 55 81 70 L 74 92 C 68 97 52 97 46 92 Z",
] as const;

/* deltoid/pec/ab highlight strokes; opacity scales with bulk in the rig */
const MUSCLES = [
    "M 50 60 C 54 57 66 57 70 60",
    "M 52 70 C 56 73 64 73 68 70",
    "M 56 78 L 56 86 M 64 78 L 64 86",
] as const;

export function bodyPaths(bulk: number): {
    limbs: Record<string, string>;
    torso: string;
    muscles: string[];
} {
    const j = joints(bulk);
    const a = (r: number) => widen(r, bulk, 0.35); // arms + neck
    const l = (r: number) => widen(r, bulk, 0.25); // legs
    const seg = (
        from: [number, number], to: [number, number],
        r: readonly [number, number], w: (r: number) => number,
    ) => capsulePath(from[0], from[1], w(r[0]), to[0], to[1], w(r[1]));
    const torso = bulk < 0.2 ? TORSOS[0] : bulk < 0.55 ? TORSOS[1] : bulk < 0.85 ? TORSOS[2] : TORSOS[3];
    return {
        limbs: {
            armFront: seg(j.armFront, j.forearmFront, LIMB_R.arm, a),
            forearmFront: seg(j.forearmFront, [j.forearmFront[0] + 8, j.forearmFront[1] + 12], LIMB_R.forearm, a),
            armBack: seg(j.armBack, j.forearmBack, LIMB_R.arm, a),
            forearmBack: seg(j.forearmBack, [j.forearmBack[0] - 6, j.forearmBack[1] + 12], LIMB_R.forearm, a),
            legFront: seg(j.legFront, j.shinFront, LIMB_R.leg, l),
            shinFront: seg(j.shinFront, [j.shinFront[0] + 2, 146], LIMB_R.shin, l),
            legBack: seg(j.legBack, j.shinBack, LIMB_R.leg, l),
            shinBack: seg(j.shinBack, [j.shinBack[0] - 2, 146], LIMB_R.shin, l),
            neck: seg(j.neck, j.head, LIMB_R.neck, a),
        },
        torso,
        muscles: [...MUSCLES],
    };
}
