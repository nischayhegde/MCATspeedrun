// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
import { computeMcatReadiness, getMcatStudyQueue } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async () => {
    const [queue, readiness] = await Promise.all([
        getMcatStudyQueue({ sessionSize: 0 }),
        computeMcatReadiness({}),
    ]);
    return { queue, readiness };
}) satisfies PageLoad;
