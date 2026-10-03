/**
 * Line-level auto resume (FR-BKM-04, T-110 + T-206). After 1 s of scroll idle the reading line's anchor (line band +
 * quote) is saved; on hide/pagehide/unmount before it resolved, the point under the reading slot is saved instead
 * (zero-size rect). On open the saved line returns to the reading slot and a resume marker shows for 2 s.
 * Cross-device (FR-BKM-05, T-303): this device's own last point is also kept device-locally, so when the synced row
 * comes from another device, is newer and is at least a page away, we reopen where *this* device was and offer
 * the other point instead of jumping (`onRemote`).
 */
import { useEffect, type RefObject } from 'react';
import { RESUME_SAVE_DEBOUNCE_MS } from '../../config';
import type { Anchor } from '../../core/anchors/types';
import type { PositionRow } from '../../core/db/models';
import { deviceId, metaRepo, positionsRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { readingLine, readingPoint, scrollToPoint, type ReadingPoint } from './navigation';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import type { Viewer } from './pdf/viewer';
import { useReaderStore } from './store';

const pointAnchor = (p: ReadingPoint): Anchor => ({
  v: 1,
  page: p.page,
  rects: [{ x: p.x, y: p.y, w: 0, h: 0 }],
  quote: { exact: '', prefix: '', suffix: '' },
});
const keyOf = (a: Anchor) => `${a.page}:${(a.rects[0]?.y ?? 0).toFixed(4)}`;

interface Options {
  pagesReady: boolean;
  getViewer: () => Viewer | null;
  getInset: () => number;
  container: RefObject<HTMLDivElement | null>;
  documentId: string;
  pdf: PDFDocumentProxy;
  docHash: string;
  /** A newer reading point from another device (FR-BKM-05): offer it, never jump to it. */
  onRemote?: (position: PositionRow) => void;
  /** Opening at a specific annotation (search result): skip restoring the resume point, keep saving. */
  restore?: boolean;
}

interface OwnPoint {
  anchor: Anchor;
  at: string;
}
const ownKey = (documentId: string) => `resume:${documentId}`;

export function useResume({
  pagesReady,
  getViewer,
  getInset,
  container,
  documentId,
  pdf,
  docHash,
  onRemote,
  restore = true,
}: Options): void {
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
      void metaRepo.set(ownKey(documentId), { anchor, at: new Date().toISOString() } satisfies OwnPoint); // device-local
      void deviceId().then((id) =>
        positionsRepo.save({
          documentId,
          page: anchor.page,
          anchor,
          progress: p.progress,
          deviceId: id,
          deviceLabel: platform.deviceLabel(),
        }),
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
    void Promise.all([db.positions.get(documentId), metaRepo.get<OwnPoint>(ownKey(documentId)), deviceId()]).then(
      ([pos, mine, me]) => {
        if (cancelled || !restore) return;
        const synced = pos && {
          anchor: pos.anchor ?? pointAnchor({ page: pos.page, x: 0.5, y: 0, progress: pos.progress }),
          at: pos.updatedAt,
        };
        const remote = pos && pos.deviceId !== me ? pos : null;
        const own = remote ? (mine?.anchor ? mine : null) : synced;
        if (
          remote &&
          (!own || Date.parse(remote.updatedAt) > Date.parse(own.at)) &&
          Math.abs(remote.page - (own?.anchor.page ?? 1)) >= 1
        )
          onRemote?.(remote);
        // nothing of ours: the very top (PDF.js scrolls page 1's edge to the scroller top, under overlay chrome)
        if (!own) return void requestAnimationFrame(() => !cancelled && (el.scrollTop = 0));
        const at = own.anchor.rects[0];
        saved = keyOf(own.anchor);
        requestAnimationFrame(() => {
          if (cancelled) return;
          scrollToPoint(v, el, own.anchor.page, at?.y ?? 0, at?.x, getInset());
          useReaderStore.getState().markResume(own.anchor);
        });
      },
    );
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      cancelled = true;
      save(); // leaving the reader
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
    };
  }, [pagesReady, getViewer, getInset, container, documentId, pdf, docHash, onRemote, restore]);
}
