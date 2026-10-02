/**
 * Line selection (T-203): tap a line (FR-LIN-01/02), native selections (FR-LIN-04), line cursor (FR-LIN-03).
 * Engine misses or failures never throw: they behave like a tap on blank space (FR-LIN-07).
 */
import { useEffect, type RefObject } from 'react';
import { anchorFromLine, anchorFromSelection } from '../../../core/anchors/anchor';
import { fromCanonical, normalize, toCanonical } from '../../../core/anchors/geometry';
import { hitTest, neighborLine, type Line, type PageLines } from '../../../core/line-engine';
import { classifyPointer, groupLineRects, type PointerKind } from '../gestures/tap';
import { getPageLines } from '../lines/pageLines';
import { pagePoint } from '../overlay/coords';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import { pageViewAt, type PdfViewer, type Viewer } from '../pdf/viewer';
import { useReaderStore, type Selection } from '../store';

const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], .annotationLayer a, .mg-toolbar, .mg-marker';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const lineSelection = (pl: PageLines, line: Line): Selection => ({ kind: 'line', page: pl.page, line, anchor: anchorFromLine(pl, line), text: line.text });

/** Tap/click selects the line under it; a tap on blank space clears the selection and calls onBlankTap. */
export function useLineTap(ready: boolean, getViewer: () => Viewer | null, container: RefObject<HTMLDivElement | null>, pdf: PDFDocumentProxy, docHash: string, onBlankTap: () => void, lastPointer: { current: PointerKind }) {
  useEffect(() => {
    const el = container.current;
    const v = getViewer();
    if (!ready || !el || !v) return;
    let down: { x: number; y: number; t: number; kind: PointerKind; max: number } | null = null;
    const blank = () => {
      useReaderStore.getState().select(null);
      onBlankTap();
    };
    const onDown = (e: PointerEvent) => {
      lastPointer.current = e.pointerType as PointerKind;
      down = e.isPrimary && !(e.target as Element).closest(INTERACTIVE) ? { x: e.clientX, y: e.clientY, t: e.timeStamp, kind: e.pointerType as PointerKind, max: 0 } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (down) down.max = Math.max(down.max, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || classifyPointer(d.kind, d, { x: e.clientX, y: e.clientY, t: e.timeStamp }, d.max, e.detail) !== 'tap') return; // native selection
      window.getSelection()?.removeAllRanges(); // stray 1-2 char selection from click jitter (ADR 0004)
      const p = pagePoint(e, v.viewer.pagesRotation);
      if (!p) return blank();
      void getPageLines(pdf, docHash, p.page).then((pl) => {
        const line = pl?.hasTextLayer ? hitTest(pl, p.x, p.y) : null;
        if (pl && line) useReaderStore.getState().select(lineSelection(pl, line));
        else blank();
      });
    };
    const cancel = () => (down = null);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [ready, getViewer, container, pdf, docHash, onBlankTap, lastPointer]);
}

/** Native text selection -> one canonical rect per visual line on the selection's first page (ADR 0004). */
export function useNativeSelection(ready: boolean, getViewer: () => Viewer | null, container: RefObject<HTMLDivElement | null>, pdf: PDFDocumentProxy, docHash: string, lastPointer: { current: PointerKind }) {
  useEffect(() => {
    const el = container.current;
    const v = getViewer();
    if (!ready || !el || !v) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const store = useReaderStore.getState();
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          if (store.selection?.kind === 'range') store.select(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const pageEl = start?.closest<HTMLElement>('.page[data-page-number]');
        if (!pageEl || !el.contains(pageEl)) return;
        const page = Number(pageEl.dataset.pageNumber);
        const box = (pageEl.querySelector(':scope > .canvasWrapper') ?? pageEl).getBoundingClientRect();
        const rot = v.viewer.pagesRotation;
        const rects = [...range.getClientRects()]
          .filter((r) => r.width > 0.5 && r.height > 0.5 && r.width < box.width * 0.99 && r.bottom > box.top && r.top < box.bottom)
          .map((r) => {
            const n = normalize({ left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height }, box);
            const x = clamp01(n.x);
            const y = clamp01(n.y);
            return toCanonical({ x, y, w: clamp01(n.x + n.w) - x, h: clamp01(n.y + n.h) - y }, rot);
          });
        const lines = groupLineRects(rects);
        if (!lines.length) return;
        const text = sel.toString();
        void getPageLines(pdf, docHash, page).then((pl) =>
          store.select({ kind: 'range', page, anchor: anchorFromSelection(page, lines, text, pl?.text ?? ''), text, touch: lastPointer.current === 'touch' }),
        );
      }, 150);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [ready, getViewer, container, pdf, docHash, lastPointer]);
}

/** Keeps the selected line inside the viewport with a 20 % margin (FR-LIN-03 auto-scroll). */
export function ensureVisible(v: PdfViewer, el: HTMLElement, sel: Selection): void {
  const pageEl = pageViewAt(v, sel.page - 1)?.div;
  const r0 = sel.anchor.rects[0];
  if (!pageEl || !r0) return;
  const box = pageEl.getBoundingClientRect();
  const d = fromCanonical(r0, v.pagesRotation);
  const top = box.top + d.y * box.height;
  const bottom = top + d.h * box.height;
  const view = el.getBoundingClientRect();
  const margin = view.height * 0.2;
  if (top < view.top + margin) el.scrollTop += top - (view.top + margin);
  else if (bottom > view.bottom - margin) el.scrollTop += bottom - (view.bottom - margin);
}

/** Move the line cursor one line across columns and pages (skips pages without text). */
export async function moveCursor(pdf: PDFDocumentProxy, docHash: string, dir: 1 | -1): Promise<Selection | null> {
  const cur = useReaderStore.getState().selection;
  if (cur?.kind !== 'line') return null;
  const pl = await getPageLines(pdf, docHash, cur.page);
  const next = pl ? neighborLine(pl, cur.line, dir) : null;
  if (pl && next) return lineSelection(pl, next);
  for (let page = cur.page + dir; page >= 1 && page <= pdf.numPages; page += dir) {
    const npl = await getPageLines(pdf, docHash, page);
    const line = dir > 0 ? npl?.lines[0] : npl?.lines.at(-1);
    if (npl && line) return lineSelection(npl, line);
  }
  return null;
}
