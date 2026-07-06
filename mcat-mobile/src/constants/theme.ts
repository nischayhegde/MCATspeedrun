/**
 * Fight Night palette, ported from the desktop Scorefighter shell
 * (ts/routes/mcat/+layout.svelte). Like the desktop, the app keeps the same
 * dark red/black look regardless of the system color scheme, so `light` and
 * `dark` share one palette.
 */

import '@/global.css';

import { Platform } from 'react-native';

const fightNight = {
  text: '#eef1f6', // --sf-text
  textSecondary: '#9aa4b6', // --sf-dim
  background: '#0d0f14', // --sf-canvas
  backgroundElement: '#161b24', // --sf-surface
  backgroundSelected: '#1f2632', // --sf-surface-2
  border: '#2a3242', // --sf-border
  red: '#e11d2f', // --sf-red (brand)
  redDeep: '#a3121c', // --sf-red-deep
  gold: '#f5c451', // --sf-gold
  ok: '#2fd67a', // --sf-ok
  okDeep: '#1a9d55', // --sf-ok-deep
  err: '#ff5d6c', // --sf-err: feedback red, deliberately NOT brand --sf-red
  warn: '#f5a03c', // --sf-warn
  steel: '#566073', // --sf-steel: neutral chrome (IDK, secondary)
} as const;

export const Colors = {
  light: fightNight,
  dark: fightNight,
} as const;

/** The Fight Night tokens directly, for use inside StyleSheet.create. */
export const Palette = fightNight;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
