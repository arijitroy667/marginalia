/**
 * Line-level navigation shared by bookmarks (T-205) and resume (T-206): the reading line, jumps that flash
 * their target (PRD §10.4), and previous/next bookmark (FR-BKM-03).
 */
import { anchorFromLine, pageAnchor } from '../../core/anchors/anchor';
import { fromCanonical } from '../../core/anchors/geometry';
import type { Anchor } from '../../core/anchors/types';
import type { AnnotationRow } from '../../core/db/models';
import { getPageLines } from './lines/pageLines';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import { pageViewAt, type PdfViewer } from './pdf/viewer';
import { useReaderStore } from './store';
import { READING_INSET_PX, readingPoint, scrollToPoint } from './useResume';

export interface LineTarget {
  anchor: Anchor;
  text: string;
}

/**
 * The reading line (PRD §5): the first line, in reading order, whose top edge is at or below the reading slot,
 * on the slot's page or else the next one. A page without text yields a whole-page anchor (FR-LIN-06).
 */
export async function readingLine(pdf: PDFDocumentProxy, docHash: string, v: PdfViewer, el: HTMLElement, inset = READING_INSET_PX): Promise<LineTarget | null> {
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
    if (line) return { anchor: anchorFromLine(pl, line), text: line.text };
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
export const inDocumentOrder = (rows: AnnotationRow[]) => [...rows].sort((a, b) => position(a.anchor) - position(b.anchor));

/** `]` / `[`: the first bookmark strictly after / before the reading slot (FR-BKM-03); a bookmark at the slot is "here". */
export function adjacentBookmark(rows: AnnotationRow[], v: PdfViewer, el: HTMLElement, dir: 1 | -1, inset = READING_INSET_PX): AnnotationRow | undefined {
  const p = readingPoint(v, el, inset);
  const here = p ? p.page + Math.min(p.y, 0.999) : 0;
  const sorted = inDocumentOrder(rows);
  return dir > 0 ? sorted.find((b) => position(b.anchor) > here + 0.005) : sorted.findLast((b) => position(b.anchor) < here - 0.005);
}
