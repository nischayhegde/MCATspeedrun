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

/** Ordered list of SVG path command letters in `d` (e.g. ["M","C","A","Z"]). */
export function pathCommandSequence(d: string): string[] {
    return d.match(/[MLCQAZ]/g) ?? [];
}

/** Closed tapered limb from (x1,y1,r1) to (x2,y2,r2) with a bezier "muscle
 * belly" bulge instead of straight sides — same M/A/A/Z contract as
 * capsulePath (two arc caps) but with C curves for the long edges so the
 * silhouette reads as organic muscle, not a straight-sided capsule. */
export function organicLimbPath(
    x1: number, y1: number, r1: number,
    x2: number, y2: number, r2: number,
    bulge = 0.35,
): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bulgeAmt = ((r1 + r2) / 2) * bulge;
    const c1x = x1 + dx * 0.33 + nx * (r1 + bulgeAmt);
    const c1y = y1 + dy * 0.33 + ny * (r1 + bulgeAmt);
    const c2x = x1 + dx * 0.67 + nx * (r2 + bulgeAmt * 0.6);
    const c2y = y1 + dy * 0.67 + ny * (r2 + bulgeAmt * 0.6);
    const d1x = x1 + dx * 0.67 - nx * (r2 + bulgeAmt * 0.6);
    const d1y = y1 + dy * 0.67 - ny * (r2 + bulgeAmt * 0.6);
    const d2x = x1 + dx * 0.33 - nx * (r1 + bulgeAmt);
    const d2y = y1 + dy * 0.33 - ny * (r1 + bulgeAmt);
    return [
        `M ${fmt(x1 + nx * r1)} ${fmt(y1 + ny * r1)}`,
        `C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(x2 + nx * r2)} ${fmt(y2 + ny * r2)}`,
        `A ${fmt(r2)} ${fmt(r2)} 0 0 0 ${fmt(x2 - nx * r2)} ${fmt(y2 - ny * r2)}`,
        `C ${fmt(d1x)} ${fmt(d1y)} ${fmt(d2x)} ${fmt(d2y)} ${fmt(x1 - nx * r1)} ${fmt(y1 - ny * r1)}`,
        `A ${fmt(r1)} ${fmt(r1)} 0 0 0 ${fmt(x1 + nx * r1)} ${fmt(y1 + ny * r1)}`,
        "Z",
    ].join(" ");
}

const GLOVE_ANGLES_DEG = [0, 55, 120, 180, 235, 300] as const;

/** Boxing-mitt silhouette: a smoothed 6-point polygon (M + six Q + Z, always
 * that exact sequence) with one vertex pushed out as a thumb bulge on the
 * `facing` side. squashX/squashY let a caller build a "contact squash"
 * keyframe with the same command structure as the rest pose, so the two
 * can be handed to the Web Animations API as `d` interpolation keyframes. */
export function glovePath(
    cx: number, cy: number, r: number,
    facing: 1 | -1 = 1, squashX = 1, squashY = 1, thumbBulge = 0.28,
): string {
    const pts = GLOVE_ANGLES_DEG.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const rr = r * (i === 1 ? 1 + thumbBulge : 1);
        return [
            cx + Math.cos(rad) * rr * squashX * facing,
            cy + Math.sin(rad) * rr * squashY,
        ];
    });
    const mid = (a: number[], b: number[]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n = pts.length;
    const start = mid(pts[n - 1], pts[0]);
    let d = `M ${fmt(start[0])} ${fmt(start[1])}`;
    for (let i = 0; i < n; i++) {
        const end = mid(pts[i], pts[(i + 1) % n]);
        d += ` Q ${fmt(pts[i][0])} ${fmt(pts[i][1])} ${fmt(end[0])} ${fmt(end[1])}`;
    }
    return `${d} Z`;
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

/* deltoid/pec/ab/oblique/serratus highlight strokes; opacity scales with bulk in the rig */
const MUSCLES = [
    "M 50 60 C 54 57 66 57 70 60",       // upper pec line
    "M 52 70 C 56 73 64 73 68 70",       // lower pec / sternum
    "M 56 78 L 56 86 M 64 78 L 64 86",   // ab center lines
    "M 48 74 C 50 80 50 86 48 92",       // left oblique
    "M 72 74 C 70 80 70 86 72 92",       // right oblique
    "M 44 64 C 47 68 47 74 45 78",       // left serratus/lat hint
    "M 76 64 C 73 68 73 74 75 78",       // right serratus/lat hint
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
    ) => organicLimbPath(from[0], from[1], w(r[0]), to[0], to[1], w(r[1]));
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
