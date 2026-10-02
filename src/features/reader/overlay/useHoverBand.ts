import { useEffect, useState, type RefObject } from 'react';
import type { NRect } from '../../../core/anchors/types';
import { hitTest } from '../../../core/line-engine';
import { getPageLines } from '../lines/pageLines';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import type { Viewer } from '../pdf/viewer';
import { pagePoint } from './coords';

export const HOVER_DELAY_MS = 120; // FR-LIN-01

/** Desktop hover: faint band on the line under the mouse after 120 ms; never on touch or while dragging. */
export function useHoverBand(ready: boolean, getViewer: () => Viewer | null, container: RefObject<HTMLDivElement | null>, pdf: PDFDocumentProxy, docHash: string) {
  const [hover, setHover] = useState<{ page: number; band: NRect } | null>(null);

  useEffect(() => {
    const el = container.current;
    const v = getViewer();
    if (!ready || !el || !v) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let lastKey = '';
    const clear = () => {
      lastKey = '';
      clearTimeout(timer);
      setHover(null);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return clear();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const p = pagePoint(e, v.viewer.pagesRotation);
        if (!p) return clear();
        void getPageLines(pdf, docHash, p.page).then((pl) => {
          const line = pl ? hitTest(pl, p.x, p.y) : null;
          const key = line ? `${p.page}:${line.index}` : '';
          if (key === lastKey) return;
          lastKey = key;
          clearTimeout(timer);
          setHover(null);
          if (line) timer = setTimeout(() => setHover({ page: p.page, band: line.band }), HOVER_DELAY_MS);
        });
      });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', clear);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', clear);
    };
  }, [ready, getViewer, container, pdf, docHash]);

  return hover;
}
