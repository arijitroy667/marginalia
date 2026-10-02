import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AnchorSchema } from '../db/models';
import { buildPageLines, type RawTextItem } from '../line-engine';
import { anchorFromLine, anchorFromSelection, markerY, pageAnchor, quoteAt, sameLine } from './anchor';

const SIZE = { width: 600, height: 800 };
const item = (str: string, x: number, base: number, w = 240): RawTextItem => ({
  str,
  rect: { x: x / 600, y: (base - 8) / 800, w: w / 600, h: 10 / 800 },
  baseline: base / 800,
  fontSize: 10,
  vertical: false,
  hasEOL: false,
});
const pl = buildPageLines(3, [item('The first line of the page', 50, 100), item('a second line, the one we want', 50, 112), item('and a third line after it', 50, 124)], SIZE);

describe('anchors (PRD §8.6)', () => {
  it('anchorFromLine: band rect, exact quote with page context', () => {
    const a = anchorFromLine(pl, pl.lines[1]!);
    expect(a.page).toBe(3);
    expect(a.rects).toEqual([pl.lines[1]!.band]);
    expect(a.quote.exact).toBe('a second line, the one we want');
    expect(a.quote.prefix.endsWith('first line of the page ')).toBe(true);
    expect(a.quote.suffix.startsWith(' and a third')).toBe(true);
    expect(AnchorSchema.safeParse(a).success).toBe(true);
  });

  it('anchorFromSelection: locates the quote in the page text, or keeps it without context', () => {
    const a = anchorFromSelection(3, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }], 'second  line,\nthe one', pl.text);
    expect(a.quote).toEqual({ exact: 'second line, the one', prefix: 'The first line of the page a ', suffix: ' we want and a third line after ' }); // 32 chars
    const b = anchorFromSelection(3, [], 'not on this page', pl.text);
    expect(b.quote).toEqual({ exact: 'not on this page', prefix: '', suffix: '' });
  });

  it('quotes are NFC, exact <= 400, context <= 32 — always schema-valid', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 900 }), fc.nat(900), fc.nat(900), (text, i, j) => {
        const [s, e] = [Math.min(i, j, text.length), Math.min(Math.max(i, j), text.length)];
        const q = quoteAt(text, s, e);
        return q.exact.length <= 400 && q.prefix.length <= 32 && q.suffix.length <= 32 && q.exact === q.exact.normalize('NFC');
      }),
    );
    expect(quoteAt('été', 0, 4).exact).toBe('été'); // decomposed -> composed
  });

  it('page anchors, marker position and line grouping', () => {
    expect(AnchorSchema.safeParse(pageAnchor(7)).success).toBe(true);
    const a = anchorFromLine(pl, pl.lines[0]!);
    expect(markerY(a)).toBeCloseTo(a.rects[0]!.y + a.rects[0]!.h / 2);
    expect(sameLine(a, anchorFromLine(pl, pl.lines[0]!))).toBe(true);
    expect(sameLine(a, anchorFromLine(pl, pl.lines[1]!))).toBe(false);
  });
});
