// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
import { computeMcatReadiness, getMcatDiagnostic } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async ({ depends }) => {
    // Without a tracked dependency SvelteKit caches this load's result and
    // never re-runs it on client navigation, so re-taking the diagnostic
    // (e.g. after a reset) would replay the first, already-seen question set.
    // Registering a dependency lets the dashboard invalidate it to force a
    // fresh, newly-seeded backend draw. See McatDashboard's reset/"Take
    // diagnostic" handlers.
    depends("mcat:diagnostic");
    const [diagnostic, before] = await Promise.all([
        getMcatDiagnostic({ questionCount: 0, seed: BigInt(0) }),
        computeMcatReadiness({}),
    ]);
    return { diagnostic, before };
}) satisfies PageLoad;
