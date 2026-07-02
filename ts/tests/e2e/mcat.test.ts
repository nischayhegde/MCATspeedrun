// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "./fixtures";

test("mcat dashboard renders scorecard", async ({ page }) => {
    await page.goto("/mcat");
    await expect(page.locator(".mcat-nav")).toBeVisible();
    await expect(page.locator(".score")).toBeVisible();
});

test("mcat study page loads (question or empty state)", async ({ page }) => {
    await page.goto("/mcat/study");
    await expect(
        page.locator(".study-page .card, .study-page .complete").first(),
    ).toBeVisible();
});

test("mcat diagnostic intro renders", async ({ page }) => {
    await page.goto("/mcat/diagnostic");
    await expect(page.locator(".diagnostic")).toBeVisible();
});
