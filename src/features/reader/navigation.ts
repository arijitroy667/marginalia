/**
 * Line-level navigation: the reading slot and reading line (PRD §5), resume restore (FR-BKM-04), jumps that
 * flash their target (§10.4), and previous/next bookmark (FR-BKM-03).
 */
import { anchorFromLine, pageAnchor } from '../../core/anchors/anchor';
import { fromCanonical, toCanonical } from '../../core/anchors/geometry';
import type { Anchor } from '../../core/anchors/types';
import type { Line, PageLines } from '../../core/line-engine';
import type { AnnotationRow } from '../../core/db/models';
import { getPageLines } from './lines/pageLines';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import { pageViewAt, type PdfViewer } from './pdf/viewer';
import { useReaderStore } from './store';

/** Default reading-slot inset below the scroller's top edge; overlay chrome adds its height (PRD §5). */
export const READING_INSET_PX = 8;

export interface ReadingPoint {
  page: number;
  x: number;
  y: number;
  progress: number;
}

/** Canonical point under the reading slot, or null if no page is there. */
export function readingPoint(v: PdfViewer, el: HTMLElement, inset = READING_INSET_PX): ReadingPoint | null {
  const slot = el.getBoundingClientRect().top + inset;
  const n = v.pagesCount;
  const rect = (i: number) => pageViewAt(v, i)?.div.getBoundingClientRect();
  // binary search for the first page whose bottom is at/below the slot: independent of PDF.js's
  // currentPageNumber, which lags behind programmatic scrolls (vertical scroll mode)
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((rect(mid)?.bottom ?? Infinity) < slot) lo = mid + 1;
    else hi = mid;
  }
  const r = rect(lo);
  if (!r || r.bottom < slot) return null;
  const frac = Math.min(1, Math.max(0, (slot - r.top) / r.height)); // in the gap above a page: its top
  const c = toCanonical({ x: 0.5, y: frac, w: 0, h: 0 }, v.pagesRotation);
  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  return { page: lo + 1, x: c.x, y: c.y, progress: atEnd ? 1 : Math.min(1, (lo + frac) / n) };
}

/** Scrolls so the canonical point (page, x, y) sits at the reading slot. */
export function scrollToPoint(
  v: PdfViewer,
  el: HTMLElement,
  page: number,
  y: number,
  x = 0.5,
  inset = READING_INSET_PX,
): void {
  const pv = pageViewAt(v, page - 1);
  if (!pv) return;
  const d = fromCanonical({ x, y, w: 0, h: 0 }, v.pagesRotation);
  const r = pv.div.getBoundingClientRect();
  el.scrollTop += r.top - el.getBoundingClientRect().top + d.y * r.height - inset;
}

export interface LineTarget {
  anchor: Anchor;
  text: string;
  /** The engine line, when the page has text (keyboard selection starts from it). */
  source?: { pl: PageLines; line: Line };
}

/**
 * The reading line (PRD §5): the first line, in reading order, whose top edge is at or below the reading slot,
 * on the slot's page or else the next one. A page without text yields a whole-page anchor (FR-LIN-06).
 */
export async function readingLine(
  pdf: PDFDocumentProxy,
  docHash: string,
  v: PdfViewer,
  el: HTMLElement,
  inset = READING_INSET_PX,
): Promise<LineTarget | null> {
  const p = readingPoint(v, el, inset);
  if (!p) return null;
  const slot = el.getBoundingClientRect().top + inset;
  for (const page of [p.page, p.page + 1]) {
    const div = pageViewAt(v, page - 1)?.div;
    const pl = div ? await getPageLines(pdf, docHash, page) : null;
    if (!div || !pl) continue;
    if (!pl.hasTextLayer) return { anchor: pageAnchor(page), text: '' };
    const r = div.getBoundingClientRect();
    const frac = (slot - r.top) / r.height;
    const line = pl.lines.find((l) => fromCanonical(l.rect, v.pagesRotation).y >= frac - 1e-4);
    if (line) return { anchor: anchorFromLine(pl, line), text: line.text, source: { pl, line } };
  }
  return null;
}

/** Scrolls the anchor's first line to the reading slot and pulses it for 1.2 s (FR-BKM-03, §10.4). */
export function jumpToAnchor(v: PdfViewer, el: HTMLElement, anchor: Anchor, inset = READING_INSET_PX): void {
  const r = anchor.rects[0] ?? { x: 0, y: 0, w: 1, h: 0 };
  useReaderStore.getState().select(null);
  scrollToPoint(v, el, anchor.page, r.y, r.x, inset);
  useReaderStore.getState().flashAt(anchor);
}

const position = (a: Anchor) => a.page + Math.min(a.rects[0]?.y ?? 0, 0.999);

/** Bookmarks in document order (page, then height on the page). */
export const inDocumentOrder = (rows: AnnotationRow[]) =>
  [...rows].sort((a, b) => position(a.anchor) - position(b.anchor));

/** `]` / `[`: the first bookmark strictly after / before the reading slot (FR-BKM-03); a bookmark at the slot is "here". */
export function adjacentBookmark(
  rows: AnnotationRow[],
  v: PdfViewer,
  el: HTMLElement,
  dir: 1 | -1,
  inset = READING_INSET_PX,
): AnnotationRow | undefined {
  const p = readingPoint(v, el, inset);
  const here = p ? p.page + Math.min(p.y, 0.999) : 0;
  const sorted = inDocumentOrder(rows);
  return dir > 0
    ? sorted.find((b) => position(b.anchor) > here + 0.005)
    : sorted.findLast((b) => position(b.anchor) < here - 0.005);
}
