// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { afterEach, expect, test, vi } from "vitest";

import { morphPath } from "./morph";

function fakeMatchMedia(reduced: boolean): void {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: reduced && query.includes("reduce"),
        media: query,
        addEventListener: () => {
            // no-op: morphPath only reads .matches, never subscribes
        },
        removeEventListener: () => {
            // no-op: morphPath only reads .matches, never subscribes
        },
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

test("calls animate with d keyframes and the given duration", () => {
    fakeMatchMedia(false);
    const calls: unknown[][] = [];
    const el = { animate: (...args: unknown[]) => calls.push(args) };
    morphPath(el, ["M 0 0 Z", "M 1 1 Z", "M 0 0 Z"], { durationMs: 560 });
    expect(calls.length).toBe(1);
    const [keyframes, options] = calls[0] as [Array<{ d: string }>, { duration: number }];
    expect(keyframes.map((k) => k.d)).toEqual(["M 0 0 Z", "M 1 1 Z", "M 0 0 Z"]);
    expect(options.duration).toBe(560);
});

test("passes a default easing when none is given, or the caller's easing when given", () => {
    fakeMatchMedia(false);
    const calls: unknown[][] = [];
    const el = { animate: (...args: unknown[]) => calls.push(args) };
    morphPath(el, ["M 0 0 Z", "M 1 1 Z"], { durationMs: 300 });
    morphPath(el, ["M 0 0 Z", "M 1 1 Z"], { durationMs: 300, easing: "linear" });
    const [, opts1] = calls[0] as [unknown, { easing: string }];
    const [, opts2] = calls[1] as [unknown, { easing: string }];
    expect(opts1.easing).toBeTruthy();
    expect(opts2.easing).toBe("linear");
});

test("no-ops under prefers-reduced-motion", () => {
    fakeMatchMedia(true);
    const calls: unknown[][] = [];
    const el = { animate: (...args: unknown[]) => calls.push(args) };
    morphPath(el, ["M 0 0 Z", "M 1 1 Z"], { durationMs: 300 });
    expect(calls.length).toBe(0);
});

test("does nothing (does not throw) when fewer than 2 keyframes are given", () => {
    fakeMatchMedia(false);
    const el = { animate: () => { throw new Error("should not be called"); } };
    expect(() => morphPath(el, ["M 0 0 Z"], { durationMs: 300 })).not.toThrow();
});
