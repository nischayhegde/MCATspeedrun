// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import {
    bodyPaths,
    BUILD_BULK,
    capsulePath,
    glovePath,
    joints,
    organicLimbPath,
    pathCommandSequence,
} from "./geometry";

test("capsulePath is a closed path with two arc caps", () => {
    const p = capsulePath(0, 0, 3, 0, 20, 5);
    expect(p.startsWith("M ")).toBe(true);
    expect(p.match(/A /g)?.length).toBe(2);
    expect(p.trim().endsWith("Z")).toBe(true);
    // sweep flag 0 = caps bulge outward, not into the limb
    expect(p).toContain("A 5.00 5.00 0 0 0");
    expect(p).toContain("A 3.00 3.00 0 0 0");
});

test("shoulders widen with bulk, joints stay anatomical", () => {
    const lean = joints(BUILD_BULK.lean);
    const col = joints(BUILD_BULK.colossal);
    expect(col.armFront[0]).toBeGreaterThan(lean.armFront[0]);
    expect(col.armBack[0]).toBeLessThan(lean.armBack[0]);
    // pivots sit exactly where the limb paths start
    const paths = bodyPaths(BUILD_BULK.colossal);
    expect(paths.limbs.armFront).toContain("A ");
});

test("torso silhouette steps through 4 drawn variants", () => {
    const seen = new Set(
        [0, 0.35, 0.7, 1].map((b) => bodyPaths(b).torso),
    );
    expect(seen.size).toBe(4);
});

test("organicLimbPath is a closed path with two arc caps, like capsulePath", () => {
    const p = organicLimbPath(0, 0, 3, 0, 20, 5);
    expect(p.startsWith("M ")).toBe(true);
    expect(p.match(/A /g)?.length).toBe(2);
    expect(p.trim().endsWith("Z")).toBe(true);
});

test("organicLimbPath's bezier control points push further from the spine than the straight radius", () => {
    const d = organicLimbPath(0, 0, 4, 0, 40, 4, 0.5);
    expect(pathCommandSequence(d)).toEqual(["M", "C", "A", "C", "A", "Z"]);
    // Vertical limb (dx=0, dy=40) => outward normal is (-1,0). First cubic
    // control point sits at x = -(r1 + bulgeAmt) = -(4 + (4+4)/2*0.5) = -6,
    // further out than the straight r1=4 edge a plain capsule would draw.
    expect(d).toContain("C -6.00 13.20");
});

test("pathCommandSequence extracts command letters in order", () => {
    expect(pathCommandSequence("M 1 2 L 3 4 A 5 5 0 0 0 6 7 Z")).toEqual(["M", "L", "A", "Z"]);
    expect(pathCommandSequence("M 0 0 Q 1 1 2 2 Q 3 3 4 4 Z")).toEqual(["M", "Q", "Q", "Z"]);
});

test("glovePath always emits the same 8-command structure regardless of squash", () => {
    const rest = glovePath(50, 50, 10, 1);
    const squashed = glovePath(50, 50, 10, 1, 1.3, 0.85);
    const mirrored = glovePath(50, 50, 10, -1);
    expect(pathCommandSequence(rest)).toEqual(["M", "Q", "Q", "Q", "Q", "Q", "Q", "Z"]);
    expect(pathCommandSequence(rest)).toEqual(pathCommandSequence(squashed));
    expect(pathCommandSequence(rest)).toEqual(pathCommandSequence(mirrored));
    expect(rest).not.toBe(squashed);
    expect(rest).not.toBe(mirrored);
});

test("bodyPaths limbs now use the organic (bezier) generator", () => {
    const paths = bodyPaths(0.5);
    expect(pathCommandSequence(paths.limbs.armFront)).toEqual(["M", "C", "A", "C", "A", "Z"]);
});

test("muscle overlay has 7 definition lines", () => {
    expect(bodyPaths(0.8).muscles.length).toBe(7);
});
