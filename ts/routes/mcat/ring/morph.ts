// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

// Structural type (not `Element`) so tests can pass a plain stub instead of
// a real DOM node — only `.animate()` is used. Method-shorthand syntax here
// (not `animate: (...) => unknown`) is required: it makes TypeScript check
// this member bivariantly, which is what lets a real SVGPathElement's
// narrower native `.animate()` signature satisfy this interface.
export interface MorphTarget {
    animate(keyframes: Array<Record<string, string>>, options: unknown): unknown;
}

export interface MorphOptions {
    durationMs: number;
    easing?: string;
}

const DEFAULT_EASING = "cubic-bezier(0.2, 0.9, 0.1, 1)";

function reducedMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Animate an SVG element's `d` attribute through a sequence of path
 * strings via the Web Animations API. All strings must share the same
 * command structure (see geometry.ts's pathCommandSequence) or the browser
 * cannot interpolate between them. No-ops under prefers-reduced-motion or
 * with fewer than 2 keyframes. */
export function morphPath(el: MorphTarget, keyframeDs: string[], opts: MorphOptions): void {
    if (keyframeDs.length < 2 || reducedMotion()) {
        return;
    }
    el.animate(
        keyframeDs.map((d) => ({ d })),
        { duration: opts.durationMs, easing: opts.easing ?? DEFAULT_EASING, fill: "none" },
    );
}
