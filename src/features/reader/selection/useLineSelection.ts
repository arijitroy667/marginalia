/**
 * Line selection (T-203): tap a line (FR-LIN-01/02), native selections (FR-LIN-04), line cursor (FR-LIN-03).
 * Engine misses or failures never throw: they behave like a tap on blank space (FR-LIN-07).
 */
import { useEffect, type RefObject } from 'react';
import { anchorFromLine, anchorFromLines, anchorFromSelection } from '../../../core/anchors/anchor';
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

export const lineSelection = (pl: PageLines, line: Line): Selection => ({
  kind: 'line',
  page: pl.page,
  line,
  anchor: anchorFromLine(pl, line),
  text: line.text,
});

/** Tap/click selects the line under it; a tap on blank space clears the selection and calls onBlankTap. */
export function useLineTap(
  ready: boolean,
  getViewer: () => Viewer | null,
  container: RefObject<HTMLDivElement | null>,
  pdf: PDFDocumentProxy,
  docHash: string,
  onBlankTap: () => void,
  lastPointer: { current: PointerKind },
) {
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
      down =
        e.isPrimary && !(e.target as Element).closest(INTERACTIVE)
          ? { x: e.clientX, y: e.clientY, t: e.timeStamp, kind: e.pointerType as PointerKind, max: 0 }
          : null;
    };
    const onMove = (e: PointerEvent) => {
      if (down) down.max = Math.max(down.max, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || classifyPointer(d.kind, d, { x: e.clientX, y: e.clientY, t: e.timeStamp }, d.max, e.detail) !== 'tap')
        return; // native selection
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
export function useNativeSelection(
  ready: boolean,
  getViewer: () => Viewer | null,
  container: RefObject<HTMLDivElement | null>,
  pdf: PDFDocumentProxy,
  docHash: string,
  lastPointer: { current: PointerKind },
) {
  useEffect(() => {
    const el = container.current;
    const v = getViewer();
    if (!ready || !el || !v) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pressed = false; // mouse/pen drag in progress: publish its final range on release, never a partial one
    const publish = () => {
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
        .filter(
          (r) =>
            r.width > 0.5 && r.height > 0.5 && r.width < box.width * 0.99 && r.bottom > box.top && r.top < box.bottom,
        )
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
        store.select({
          kind: 'range',
          page,
          anchor: anchorFromSelection(page, lines, text, pl?.text ?? ''),
          text,
          touch: lastPointer.current === 'touch',
        }),
      );
    };
    const onChange = () => {
      clearTimeout(timer);
      if (!pressed) timer = setTimeout(publish, 150); // touch handles: settle first
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.button === 0) pressed = true;
    };
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      clearTimeout(timer);
      publish();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp); // the release may land outside the reader
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [ready, getViewer, container, pdf, docHash, lastPointer]);
}

/** Keeps the line cursor (the moving end of a range) inside the viewport with a 20 % margin (FR-LIN-03). */
export function ensureVisible(v: PdfViewer, el: HTMLElement, sel: Selection): void {
  const pageEl = pageViewAt(v, sel.page - 1)?.div;
  const r0 = sel.kind === 'line' ? sel.line.band : sel.anchor.rects[0];
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

/** Shift+arrow (FR-LIN-05): grow or shrink the line range from its fixed end, within the page (anchors are per page). */
export async function extendCursor(pdf: PDFDocumentProxy, docHash: string, dir: 1 | -1): Promise<Selection | null> {
  const cur = useReaderStore.getState().selection;
  if (cur?.kind !== 'line') return null;
  const pl = await getPageLines(pdf, docHash, cur.page);
  const next = pl ? neighborLine(pl, cur.line, dir) : null;
  if (!pl || !next) return null;
  const from = cur.from ?? cur.line;
  const lines = pl.lines.filter(
    (l) => l.index >= Math.min(from.index, next.index) && l.index <= Math.max(from.index, next.index),
  );
  return {
    kind: 'line',
    page: pl.page,
    line: next,
    from,
    anchor: anchorFromLines(pl, from, next),
    text: lines.map((l) => l.text).join('\n'),
  };
}

/**
 * Pages without text (FR-LIN-08): a mouse/pen drag draws a rectangle that becomes a `region` selection with an
 * empty quote, so the toolbar can highlight, note or bookmark it. Touch keeps scrolling (a drawing mode would need
 * touch-action changes before the gesture starts). A click stays a tap for useLineTap.
 */
export function useRegionSelect(
  ready: boolean,
  getViewer: () => Viewer | null,
  container: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const el = container.current;
    const v = getViewer();
    if (!ready || !el || !v) return;
    let drag: { page: number; pageEl: HTMLElement; x: number; y: number } | null = null;
    const at = (e: PointerEvent, pageEl: HTMLElement) => {
      const r = pageEl.getBoundingClientRect();
      return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
    };
    const rect = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      toCanonical(
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) },
        v.viewer.pagesRotation,
      );
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const pageEl = (e.target as Element).closest<HTMLElement>('.page[data-page-number]');
      if (!pageEl?.querySelector('.mg-banner')) return; // only pages flagged as having no text (FR-LIN-06)
      drag = { page: Number(pageEl.dataset.pageNumber), pageEl, ...at(e, pageEl) };
      e.preventDefault(); // no native image drag
    };
    const onMove = (e: PointerEvent) => {
      if (drag) useReaderStore.getState().setRegion({ page: drag.page, rect: rect(drag, at(e, drag.pageEl)) });
    };
    const onUp = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d) return;
      const store = useReaderStore.getState();
      store.setRegion(null);
      const r = rect(d, at(e, d.pageEl));
      if (r.w < 0.01 || r.h < 0.005) return; // a click, not a rectangle
      store.select({
        kind: 'region',
        page: d.page,
        anchor: { v: 1, page: d.page, rects: [r], quote: { exact: '', prefix: '', suffix: '' } },
        text: '',
      });
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [ready, getViewer, container]);
}
