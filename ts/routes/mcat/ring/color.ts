// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

/** Lighten (percent > 0) or darken (percent < 0) a hex color toward white/black. */
export function shadeColor(hex: string, percent: number): string {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
    const mix = (channel: number): number =>
        percent >= 0 ? channel + (255 - channel) * percent : channel * (1 + percent);
    const toHex = (v: number): string => clamp(v).toString(16).padStart(2, "0");
    return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
