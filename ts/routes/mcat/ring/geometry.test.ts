// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { BUILD_BULK, bodyPaths, capsulePath, joints } from "./geometry";

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
