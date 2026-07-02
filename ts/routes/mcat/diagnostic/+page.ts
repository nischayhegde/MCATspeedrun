// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
import { computeMcatReadiness, getMcatDiagnostic } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async () => {
    const [diagnostic, before] = await Promise.all([
        getMcatDiagnostic({ questionCount: 0, seed: BigInt(0) }),
        computeMcatReadiness({}),
    ]);
    return { diagnostic, before };
}) satisfies PageLoad;
