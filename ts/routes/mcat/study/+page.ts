// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
import { getMcatStudyQueue } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async () => {
    const queue = await getMcatStudyQueue({ sessionSize: 0 });
    return { queue };
}) satisfies PageLoad;
