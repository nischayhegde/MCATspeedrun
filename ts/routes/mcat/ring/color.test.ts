// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "vitest";

import { shadeColor } from "./color";

test("percent 0 returns the color unchanged", () => {
    expect(shadeColor("#808080", 0)).toBe("#808080");
});

test("positive percent lightens toward white", () => {
    expect(shadeColor("#000000", 1)).toBe("#ffffff");
    expect(shadeColor("#000000", 0.5)).toBe("#808080");
});

test("negative percent darkens toward black", () => {
    expect(shadeColor("#ffffff", -1)).toBe("#000000");
    expect(shadeColor("#ffffff", -0.5)).toBe("#808080");
});

test("accepts hex with or without leading #", () => {
    expect(shadeColor("e11d2f", 0)).toBe("#e11d2f");
});

test("clamps channels into 00-ff", () => {
    expect(shadeColor("#f5c451", 1)).toBe("#ffffff");
    expect(shadeColor("#3a4358", -1)).toBe("#000000");
});
