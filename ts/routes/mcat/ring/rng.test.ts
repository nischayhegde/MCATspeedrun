// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { hashId, mulberry32, ShuffleBag } from "./rng";

test("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
        const v = a();
        expect(v).toBe(b());
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    }
});

test("ShuffleBag deals every item once per cycle", () => {
    const bag = new ShuffleBag(["a", "b", "c", "d"], mulberry32(7));
    const cycle = [bag.next(), bag.next(), bag.next(), bag.next()].sort();
    expect(cycle).toEqual(["a", "b", "c", "d"]);
});

test("ShuffleBag never repeats across refill boundary", () => {
    const bag = new ShuffleBag(["a", "b", "c"], mulberry32(3));
    let prev = bag.next();
    for (let i = 0; i < 300; i++) {
        const cur = bag.next();
        expect(cur).not.toBe(prev);
        prev = cur;
    }
});

test("hashId is deterministic and varies with salt", () => {
    expect(hashId(123456789n)).toBe(hashId(123456789n));
    expect(hashId(123456789n, 1)).not.toBe(hashId(123456789n, 2));
});
