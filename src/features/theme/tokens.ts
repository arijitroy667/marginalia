/** Theme tokens (PRD §8.7, ADR 0002). Single source: applyTheme() writes them as CSS variables. */
export type ThemeId = 'system' | 'light' | 'warm' | 'dark';
export type ResolvedTheme = Exclude<ThemeId, 'system'>;
export type ColorId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ThemeTokens {
  pageBg: string; // page filter target: white -> pageBg
  pageFg: string; // page filter target: black -> pageFg
  uiBg: string;
  surface: string; // toolbars, panels, popovers
  uiFg: string;
  uiMuted: string;
  accent: string;
  accentFg: string; // text on accent
  border: string; // decorative dividers
  borderStrong: string; // input/control outlines (>= 3:1, WCAG 1.4.11)
  highlight: Record<ColorId, string>;
  highlightBlend: 'multiply' | 'normal';
  highlightAlpha: number;
}

/** Light-theme starting hex for palette slots; users relabel/recolour them (FR-HLT-02). */
const HIGHLIGHT: Record<ColorId, string> = {
  1: '#FFE066', // Yellow — Key idea
  2: '#8FD694', // Green — Definition
  3: '#7CC4F4', // Blue — Look up
  4: '#F59BB4', // Pink — Disagree / doubt
  5: '#C3A6F2', // Purple — Revisit
  6: '#FFB870',
  7: '#6FD6C8',
  8: '#C9C9C9',
};

export const THEMES: Record<ResolvedTheme, ThemeTokens> = {
  light: {
    pageBg: '#FFFFFF',
    pageFg: '#1A1A1A',
    uiBg: '#FAFAF9',
    surface: '#FFFFFF',
    uiFg: '#1C1917',
    uiMuted: '#57534E',
    accent: '#2456C8',
    accentFg: '#FFFFFF',
    border: '#D6D3D1',
    borderStrong: '#78716C',
    highlight: HIGHLIGHT,
    highlightBlend: 'multiply',
    highlightAlpha: 1,
  },
  warm: {
    pageBg: '#F4ECD8',
    pageFg: '#3B2F2F',
    uiBg: '#EFE6CF',
    surface: '#F6EFDD',
    uiFg: '#2B2118',
    uiMuted: '#5E4C38',
    accent: '#8A4210',
    accentFg: '#FFFFFF',
    border: '#CDBF9C',
    borderStrong: '#857154',
    highlight: HIGHLIGHT,
    highlightBlend: 'multiply',
    highlightAlpha: 1,
  },
  dark: {
    pageBg: '#121212',
    pageFg: '#E6E1D6',
    uiBg: '#1B1B1B',
    surface: '#242424',
    uiFg: '#ECEAE6',
    uiMuted: '#A8A29E',
    accent: '#8AB4F8',
    accentFg: '#10213D',
    border: '#3A3836',
    borderStrong: '#8A8580',
    highlight: HIGHLIGHT,
    highlightBlend: 'normal',
    highlightAlpha: 0.38,
  },
};
