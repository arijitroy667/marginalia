/**
 * Page-level auto resume (FR-BKM-04, T-110; the reading-line anchor arrives in T-206).
 * The resume point is the canonical point under the reading slot (viewport top + 8 px, PRD §5), stored as a
 * page-level anchor (zero-size rect, empty quote) so it is zoom- and device-independent.
 */
import { useEffect, type RefObject } from 'react';
import { RESUME_SAVE_DEBOUNCE_MS } from '../../config';
import { fromCanonical, toCanonical } from '../../core/anchors/geometry';
import type { Anchor } from '../../core/anchors/types';
import { deviceId, positionsRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { pageViewAt, type PdfViewer, type Viewer } from './pdf/viewer';

/** Default reading-slot inset below the scroller's top edge; overlay chrome adds its height (PRD §5). */
export const READING_INSET_PX = 8;

interface Point {
  page: number;
  x: number;
  y: number;
  progress: number;
}

/** Canonical point under the reading slot, or null if no page is there. */
export function readingPoint(v: PdfViewer, el: HTMLElement, inset = READING_INSET_PX): Point | null {
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
export function scrollToPoint(v: PdfViewer, el: HTMLElement, page: number, y: number, x = 0.5, inset = READING_INSET_PX): void {
  const pv = pageViewAt(v, page - 1);
  if (!pv) return;
  const d = fromCanonical({ x, y, w: 0, h: 0 }, v.pagesRotation);
  const r = pv.div.getBoundingClientRect();
  el.scrollTop += r.top - el.getBoundingClientRect().top + d.y * r.height - inset;
}

const pageAnchor = (p: Point): Anchor => ({ v: 1, page: p.page, rects: [{ x: p.x, y: p.y, w: 0, h: 0 }], quote: { exact: '', prefix: '', suffix: '' } });
const keyOf = (page: number, y: number) => `${page}:${y.toFixed(4)}`;

export function useResume({ pagesReady, getViewer, getInset, container, documentId }: { pagesReady: boolean; getViewer: () => Viewer | null; getInset: () => number; container: RefObject<HTMLDivElement | null>; documentId: string }): void {
  useEffect(() => {
    const v = getViewer()?.viewer;
    const el = container.current;
    if (!pagesReady || !v || !el) return;
    let cancelled = false;
    let latest: Point | null = null; // kept current on scroll, so unmount never touches a destroyed viewer
    let saved = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      clearTimeout(timer);
      const p = latest;
      if (!p || keyOf(p.page, p.y) === saved) return;
      saved = keyOf(p.page, p.y);
      void deviceId().then((id) =>
        positionsRepo.save({ documentId, page: p.page, anchor: pageAnchor(p), progress: p.progress, deviceId: id, deviceLabel: platform.deviceLabel() }),
      );
    };
    const onScroll = () => {
      latest = readingPoint(v, el, getInset()) ?? latest;
      clearTimeout(timer);
      timer = setTimeout(save, RESUME_SAVE_DEBOUNCE_MS); // 1 s of scroll idle
    };
    const onVisibility = () => document.visibilityState === 'hidden' && save();

    el.addEventListener('scroll', onScroll, { passive: true }); // from the start: no early scroll goes unsaved
    void db.positions.get(documentId).then((pos) => {
      if (cancelled) return;
      // nothing saved: the very top (PDF.js scrolls page 1's edge to the scroller top, under overlay chrome)
      if (!pos) return void requestAnimationFrame(() => !cancelled && (el.scrollTop = 0));
      const at = pos.anchor?.rects[0];
      saved = keyOf(pos.page, at?.y ?? 0);
      requestAnimationFrame(() => !cancelled && scrollToPoint(v, el, pos.page, at?.y ?? 0, at?.x, getInset()));
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      cancelled = true;
      save(); // leaving the reader
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
    };
  }, [pagesReady, getViewer, getInset, container, documentId]);
}
