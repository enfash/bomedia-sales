/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { withAlpha } from '@/utils/color';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#2e388d',
    primaryPressed: '#141f76',
    primaryContainer: '#939efe',
    onPrimary: '#ffffff',
    background: '#f8f9ff',
    surface: '#f8f9ff',
    surfaceLowest: '#ffffff',
    surfaceLow: '#eff4ff',
    surfaceMedium: '#e5eeff',
    surfaceHigh: '#dce9ff',
    surfaceHighest: '#d3e4fe',
    textPrimary: '#0b1c30',
    textSecondary: '#454651',
    textInverse: '#eaf1ff',
    outline: '#767683',
    outlineVariant: '#c6c5d3',
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

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

/** Native/mobile reading column — a narrow, centered content width. */
export const MaxContentWidth = 800;

/**
 * Web admin dashboard content column. Every web page (dashboard, records, and
 * the shared PageContainer screens) uses this same max-width + horizontal
 * padding so their content edges line up when switching tabs.
 */
export const WebContentMaxWidth = 1440;
export const WebContentPaddingH = 40;
export const WebContentPaddingV = 32;

/**
 * The web top bar — fixed app chrome, so it stays the same brand navy in both
 * colour schemes rather than switching with the theme. Flat by design: it is
 * separated from the content below by a slightly darker 1px border, never a
 * shadow.
 *
 * The two blues are the brand primary and its pressed shade — no new primary
 * blues (brand rule). The control fills are translucent off-white over that
 * navy rather than invented lighter hexes, which also keeps the search field
 * and icon hovers consistent if the header blue ever moves.
 */
const WebHeaderForeground = 'rgb(240, 240, 240)';

export const WebHeader = {
  height: 48,
  background: Colors.light.primary,
  border: Colors.light.primaryPressed,
  /** Soft off-white for text and icons — comfortable contrast, not harsh. */
  foreground: WebHeaderForeground,
  /** Placeholders, the ⌘K hint and other de-emphasised glyphs. */
  foregroundMuted: withAlpha(WebHeaderForeground, 0.62),
  /** Search field fill — reads as a distinct control against the header. */
  control: withAlpha(WebHeaderForeground, 0.1),
  /** Hover background for the icon buttons and the search field. */
  controlHover: withAlpha(WebHeaderForeground, 0.16),
  /** Soft rounded square behind icon buttons. */
  radius: 6,
  /** Matches the sidebar's transition so hovers fade rather than snap. */
  transition: '0.15s',
} as const;
