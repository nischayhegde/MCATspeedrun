// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

// One fighter's own pose. The jab/cross/hook/uppercut variants are distinct
// punches used for the diagnostic heavy-bag workout so answers never look
// repetitive.
export type Sub =
    | "idle"
    | "ready"
    | "jumprope"
    | "punch"
    | "block"
    | "hit"
    | "jab"
    | "cross"
    | "hook"
    | "uppercut";

// A ring-level action (drives both fighters). See PRD gamification mapping.
export type BoxerAction = "idle" | "ready" | "jumprope" | "punch" | "block" | "hit";

// The ordered set of heavy-bag punches; the ring cycles these so every answer
// lands a different-looking punch.
export const PUNCHES: Sub[] = ["jab", "cross", "hook", "uppercut"];

// Playful onomatopoeia shown per punch (indexed to PUNCHES).
export const PUNCH_SFX: string[] = ["POW!", "BAM!", "WHAM!", "BOOM!"];
