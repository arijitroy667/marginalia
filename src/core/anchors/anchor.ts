/**
 * Anchor creation (PRD §8.6). Rendering and jumping never call the Line Engine: they use `rects`.
 * The quote (W3C TextQuoteSelector style: exact + 32-char prefix/suffix, NFC) serves display, search,
 * export and P2 relinking. The volatile `hint` offsets are optional and omitted until relinking needs them.
 */
import type { Line, PageLines } from '../line-engine';
import type { Anchor, NRect } from './types';

export const QUOTE_MAX = 400;
export const CONTEXT = 32;

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ');

/** Quote for text[start, end) with up to 32 chars of context each side. */
export function quoteAt(text: string, start: number, end: number): Anchor['quote'] {
  return {
    exact: clean(text.slice(start, end)).trim().slice(0, QUOTE_MAX),
    prefix: clean(text.slice(Math.max(0, start - CONTEXT * 2), start)).slice(-CONTEXT),
    suffix: clean(text.slice(end, end + CONTEXT * 2)).slice(0, CONTEXT),
  };
}

/** Whole-line anchor: the line's highlight band, quoted against the page text. */
export function anchorFromLine(pl: PageLines, line: Line): Anchor {
  let start = 0;
  for (const l of pl.lines) {
    if (l.index === line.index) break;
    start += l.text.length + 1; // PageLines.text joins lines with '\n'
  }
  return { v: 1, page: pl.page, rects: [line.band], quote: quoteAt(pl.text, start, start + line.text.length) };
}

/** Multi-line anchor (selection or extended line range) from canonical rects and the selected text. */
export function anchorFromSelection(page: number, rects: NRect[], selected: string, pageText = ''): Anchor {
  const exact = clean(selected).trim();
  const hay = clean(pageText);
  const at = exact ? hay.indexOf(exact) : -1;
  const quote = at >= 0 ? quoteAt(hay, at, at + exact.length) : { exact: exact.slice(0, QUOTE_MAX), prefix: '', suffix: '' };
  return { v: 1, page, rects, quote };
}

/** Page-level anchor for pages without a text layer (FR-LIN-06): the whole page. */
export const pageAnchor = (page: number): Anchor => ({ v: 1, page, rects: [{ x: 0, y: 0, w: 1, h: 1 }], quote: { exact: '', prefix: '', suffix: '' } });

/** Vertical centre of the first rect: where gutter markers sit (PRD §8.6). */
export const markerY = (a: Anchor): number => (a.rects[0] ? a.rects[0].y + a.rects[0].h / 2 : 0);

/** Same visual line? (first rects overlap vertically by >= half the smaller height) — groups rows per line. */
export function sameLine(a: Anchor, b: Anchor): boolean {
  const r = a.rects[0];
  const s = b.rects[0];
  if (a.page !== b.page || !r || !s) return false;
  return Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y) >= Math.min(r.h, s.h) / 2;
}

/**
 * Do two anchors share a visual line? Some rect pair overlaps horizontally and vertically by >= half the
 * smaller height (the Line Engine's rule), so the other column at the same height never matches (FR-HLT-03).
 */
export function intersects(a: Anchor, b: Anchor): boolean {
  if (a.page !== b.page) return false;
  return a.rects.some((r) =>
    b.rects.some(
      (s) => Math.min(r.x + r.w, s.x + s.w) > Math.max(r.x, s.x) && Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y) >= Math.min(r.h, s.h) / 2,
    ),
  );
}
