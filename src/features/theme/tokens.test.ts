import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../../core/db/models';
import { composite, contrastRatio } from '../../shared/utils/contrast';
import { highlightContrast, pageFilter, THEMES, warmthColor, type ResolvedTheme } from './tokens';

describe('theme tokens meet WCAG AA (FR-THM-05, NFR-A11Y-01)', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it(`${name}: text >= 4.5:1, controls/icons >= 3:1`, () => {
      expect(contrastRatio(t.uiFg, t.uiBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.uiFg, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.uiMuted, t.uiBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.uiMuted, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.accent, t.uiBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.accentFg, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.borderStrong, t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.pageFg, t.pageBg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('highlights stay legible in every theme (FR-THM-05, FR-HLT-02)', () => {
  for (const theme of Object.keys(THEMES) as ResolvedTheme[])
    for (const p of DEFAULT_PALETTE)
      it(`${theme}: text under ${p.label} (${p.hex}) >= 4.5:1`, () =>
        expect(highlightContrast(theme, p.hex)).toBeGreaterThanOrEqual(4.5));
});

describe('page recolour filter (ADR 0002)', () => {
  it('maps black to pageFg and white to pageBg exactly', () => {
    for (const t of ['warm', 'dark'] as const) {
      const f = pageFilter(THEMES[t].pageFg, THEMES[t].pageBg);
      const at = (c: number) =>
        `#${f
          .map((ch) =>
            Math.round((ch.intercept + ch.slope * c) * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')}`;
      expect(at(0)).toBe(THEMES[t].pageFg.toLowerCase());
      expect(at(1)).toBe(THEMES[t].pageBg.toLowerCase());
    }
  });
});

describe('warmth (FR-THM-03)', () => {
  it('0 % is a no-op white, 100 % a warm amber; text stays legible over it', () => {
    expect(warmthColor(0)).toBe('rgb(255 255 255)');
    expect(warmthColor(100)).toBe('rgb(255 191 102)');
    expect(warmthColor(250)).toBe(warmthColor(100));
    for (const t of Object.values(THEMES)) {
      const amber = '#FFBF66';
      expect(
        contrastRatio(composite(amber, t.pageFg, 'multiply', 1), composite(amber, t.pageBg, 'multiply', 1)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('composite', () => {
  it('multiplies and alpha-blends like CSS', () => {
    expect(composite('#FFE066', '#FFFFFF', 'multiply', 1)).toBe('#ffe066');
    expect(composite('#808080', '#808080', 'multiply', 1)).toBe('#404040');
    expect(composite('#FFFFFF', '#000000', 'normal', 0.5)).toBe('#808080');
    expect(composite('#123456', '#ABCDEF', 'normal', 0)).toBe('#abcdef');
  });
});

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
