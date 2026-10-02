import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../shared/utils/contrast';
import { THEMES } from './tokens';

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

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
