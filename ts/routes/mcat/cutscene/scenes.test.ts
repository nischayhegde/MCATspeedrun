// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { SPECIES } from "../ring/roster";
import { DIP_LEAD_MS, SCENES, startTimes, totalMs } from "./scenes";

test("cutscene runs at least a minute and a half", () => {
    expect(totalMs()).toBeGreaterThanOrEqual(90_000);
});

test("every scene holds long enough to read and ids/images are unique", () => {
    const ids = new Set<string>();
    const images = new Set<string>();
    for (const scene of SCENES) {
        expect(scene.ms).toBeGreaterThanOrEqual(4000);
        expect(ids.has(scene.id)).toBe(false);
        ids.add(scene.id);
        if (scene.img) {
            expect(images.has(scene.img)).toBe(false);
            images.add(scene.img);
        } else {
            expect(scene.text).toBe(""); // DOM cards carry their own copy
        }
    }
    // every image scene narrates the story
    for (const scene of SCENES.filter((scene) => scene.img)) {
        expect(scene.text.length).toBeGreaterThan(10);
    }
});

test("ken burns endpoints keep the 1536x1024 frames covering the viewport", () => {
    for (const scene of SCENES) {
        for (
            const [scale, x, y] of [
                [scene.kb.s0, scene.kb.x0, scene.kb.y0],
                [scene.kb.s1, scene.kb.x1, scene.kb.y1],
            ]
        ) {
            expect(scale).toBeGreaterThanOrEqual(1);
            expect(scale).toBeLessThanOrEqual(1.3);
            // translate(%) is of the element size; scale(s) leaves
            // (s-1)/2 * 100% of slack per side around a covering image
            const slack = ((scale - 1) / 2) * 100;
            expect(Math.abs(x)).toBeLessThanOrEqual(slack + 1e-9);
            expect(Math.abs(y)).toBeLessThanOrEqual(slack + 1e-9);
        }
    }
});

test("dip veils have room to land before their scene swaps", () => {
    const starts = startTimes();
    SCENES.forEach((scene, i) => {
        if (i > 0 && scene.enter === "dip") {
            expect(starts[i] - DIP_LEAD_MS).toBeGreaterThan(0);
            expect(SCENES[i - 1].ms).toBeGreaterThan(DIP_LEAD_MS);
        }
    });
});

test("the intro introduces the actual ring roster", () => {
    const plates = SCENES.map((scene) => scene.plate?.text ?? "").join(" ");
    for (const species of Object.values(SPECIES)) {
        if (species.id === "rookie") {
            continue; // the rookie silhouette is the hero, not a monster
        }
        expect(plates).toContain(species.name);
    }
});
