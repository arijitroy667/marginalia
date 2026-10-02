/** Theme tokens (PRD §8.7, ADR 0002). Single source: applyTheme() writes them as CSS variables. */
import { composite, contrastRatio } from '../../shared/utils/contrast';

export type ThemeId = 'system' | 'light' | 'warm' | 'dark';
export type ResolvedTheme = Exclude<ThemeId, 'system'>;

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
  highlightBlend: 'multiply' | 'normal'; // how the palette wash (settings, FR-HLT-02) composites over the page
  highlightAlpha: number;
}

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
    highlightBlend: 'normal',
    highlightAlpha: 0.38,
  },
};

/**
 * Contrast of page text under a highlight of `hex` in `theme` (FR-THM-05: >= 4.5:1): the wash composites over
 * both the paper and the glyphs. The palette editor warns below 4.5 (FR-HLT-02).
 */
export function highlightContrast(theme: ResolvedTheme, hex: string): number {
  const t = THEMES[theme];
  const wash = (under: string) => composite(hex, under, t.highlightBlend, t.highlightAlpha);
  return contrastRatio(wash(t.pageFg), wash(t.pageBg));
}
