// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
import { redirect } from "@sveltejs/kit";

import { computeMcatReadiness, getMcatStudyQueue } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async () => {
    const [queue, readiness] = await Promise.all([
        getMcatStudyQueue({ sessionSize: 0 }),
        computeMcatReadiness({}),
    ]);
    // Study requires at least some assessed evidence, which only a diagnostic
    // (even a partial one, submitted early) can seed.
    if (!readiness.leaves.some((leaf) => leaf.assessed)) {
        throw redirect(302, "/mcat/diagnostic");
    }
    return { queue, readiness };
}) satisfies PageLoad;
