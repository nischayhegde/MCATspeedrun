// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { expect, test } from "./fixtures";

test("mcat dashboard renders scorecard", async ({ page }) => {
    await page.goto("/mcat");
    await expect(page.locator(".mcat-nav")).toBeVisible();
    await expect(page.locator(".score")).toBeVisible();
});

test("mcat study page redirects to the diagnostic before any evidence exists", async ({ page }) => {
    // A fresh profile has no assessed leaves yet, so Study is gated behind
    // taking (at least part of) the diagnostic first.
    await page.goto("/mcat/study");
    await expect(page).toHaveURL(/\/mcat\/diagnostic$/);
    await expect(page.locator(".diagnostic")).toBeVisible();
});

test("mcat diagnostic intro renders", async ({ page }) => {
    await page.goto("/mcat/diagnostic");
    await expect(page.locator(".diagnostic")).toBeVisible();
});
