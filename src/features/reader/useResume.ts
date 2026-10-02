/**
 * Line-level auto resume (FR-BKM-04, T-110 + T-206). After 1 s of scroll idle the reading line's anchor (line band +
 * quote) is saved; on hide/pagehide/unmount before it resolved, the point under the reading slot is saved instead
 * (zero-size rect). On open the saved line returns to the reading slot and a resume marker shows for 2 s.
 */
import { useEffect, type RefObject } from 'react';
import { RESUME_SAVE_DEBOUNCE_MS } from '../../config';
import type { Anchor } from '../../core/anchors/types';
import { deviceId, positionsRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { readingLine, readingPoint, scrollToPoint, type ReadingPoint } from './navigation';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import type { Viewer } from './pdf/viewer';
import { useReaderStore } from './store';

const pointAnchor = (p: ReadingPoint): Anchor => ({ v: 1, page: p.page, rects: [{ x: p.x, y: p.y, w: 0, h: 0 }], quote: { exact: '', prefix: '', suffix: '' } });
const keyOf = (a: Anchor) => `${a.page}:${(a.rects[0]?.y ?? 0).toFixed(4)}`;

interface Options {
  pagesReady: boolean;
  getViewer: () => Viewer | null;
  getInset: () => number;
  container: RefObject<HTMLDivElement | null>;
  documentId: string;
  pdf: PDFDocumentProxy;
  docHash: string;
}

export function useResume({ pagesReady, getViewer, getInset, container, documentId, pdf, docHash }: Options): void {
  useEffect(() => {
    const v = getViewer()?.viewer;
    const el = container.current;
    if (!pagesReady || !v || !el) return;
    let cancelled = false;
    let latest: ReadingPoint | null = null; // kept current on scroll, so unmount never touches a destroyed viewer
    let line: Anchor | null = null; // the reading line at `latest`, once resolved
    let scrolls = 0;
    let saved = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      clearTimeout(timer);
      const p = latest;
      if (!p) return;
      const anchor = line ?? pointAnchor(p);
      if (keyOf(anchor) === saved) return;
      saved = keyOf(anchor);
      void deviceId().then((id) =>
        positionsRepo.save({ documentId, page: anchor.page, anchor, progress: p.progress, deviceId: id, deviceLabel: platform.deviceLabel() }),
      );
    };
    const onScroll = () => {
      latest = readingPoint(v, el, getInset()) ?? latest;
      line = null;
      const n = ++scrolls;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 1 s of scroll idle: resolve the reading line, then save it (a newer scroll discards this one)
        void readingLine(pdf, docHash, v, el, getInset()).then((t) => {
          if (cancelled || n !== scrolls) return;
          line = t?.anchor ?? null;
          save();
        });
      }, RESUME_SAVE_DEBOUNCE_MS);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && save();

    el.addEventListener('scroll', onScroll, { passive: true }); // from the start: no early scroll goes unsaved
    void db.positions.get(documentId).then((pos) => {
      if (cancelled) return;
      // nothing saved: the very top (PDF.js scrolls page 1's edge to the scroller top, under overlay chrome)
      if (!pos) return void requestAnimationFrame(() => !cancelled && (el.scrollTop = 0));
      const anchor = pos.anchor ?? pointAnchor({ page: pos.page, x: 0.5, y: 0, progress: pos.progress });
      const at = anchor.rects[0];
      saved = keyOf(anchor);
      requestAnimationFrame(() => {
        if (cancelled) return;
        scrollToPoint(v, el, anchor.page, at?.y ?? 0, at?.x, getInset());
        useReaderStore.getState().markResume(anchor);
      });
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
  }, [pagesReady, getViewer, getInset, container, documentId, pdf, docHash]);
}
