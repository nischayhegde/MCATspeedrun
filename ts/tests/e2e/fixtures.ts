// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

export const test = base.extend({
    // Each test gets a fresh browser context, so the intro cutscene would
    // otherwise auto-play over every mcat page. Seed its once-per-session
    // flag before any page script runs (same idea as launch_anki_for_e2e.py
    // seeding firstRun=False to skip the profile chooser).
    context: async ({ context }, use) => {
        await context.addInitScript(() => {
            sessionStorage.setItem("sf-intro-seen", "1");
        });
        await use(context);
    },
});
