/**
 * Document theming per rendered page (FR-THM-02, ADR 0002). The recolour itself is CSS on `:root[data-theme]`, so a
 * theme switch never re-renders or re-parses (FR-THM-04). Here, on every render and theme change:
 *   - pages that are already dark (mean luminance < 0.35) are marked and skip the Dark filter;
 *   - in Dark, image regions are restored from the unfiltered canvas, unless "Invert images" is on or images cover
 *     > 80 % of the page (scanned: stays inverted).
 */
import { useEffect } from 'react';
import type { ResolvedTheme } from '../theme/tokens';
import { pageViewAt, type Viewer } from './pdf/viewer';

const DARK_PAGE = 0.35;
const SCANNED = 0.8;
const MIN_PX = 4;

/** Mean relative luminance of a canvas, sampled at 16 x 16. */
function meanLuminance(canvas: HTMLCanvasElement): number {
  const s = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
  const ctx = s.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  s.width = s.height = 0; // free it now (iOS canvas budget)
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  return sum / 255 / (d.length / 4);
}

function clearRestore(div: HTMLElement): void {
  const layer = div.querySelector(':scope > .mg-img-restore');
  layer?.querySelectorAll('canvas').forEach((c) => (c.width = c.height = 0));
  layer?.remove();
}

/** Copies image regions (normalised parallelograms from PDF.js's image tracker) out of the unfiltered canvas. */
function restoreImages(div: HTMLElement, canvas: HTMLCanvasElement, coords: ArrayLike<number>): void {
  const rects: { sx: number; sy: number; sw: number; sh: number }[] = [];
  let area = 0;
  for (let i = 0; i + 5 < coords.length; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = Array.from({ length: 6 }, (_, k) => coords[i + k]!) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const xs = [x1, x2, x3, x2 + x3 - x1];
    const ys = [y1, y2, y3, y2 + y3 - y1];
    const l = Math.max(0, Math.min(...xs));
    const r = Math.min(1, Math.max(...xs));
    const t = Math.max(0, Math.min(...ys));
    const b = Math.min(1, Math.max(...ys));
    if (r <= l || b <= t) continue;
    area += (r - l) * (b - t);
    const sx = Math.floor(l * canvas.width);
    const sy = Math.floor(t * canvas.height);
    const sw = Math.ceil(r * canvas.width) - sx;
    const sh = Math.ceil(b * canvas.height) - sy;
    if (sw >= MIN_PX && sh >= MIN_PX) rects.push({ sx, sy, sw, sh });
  }
  if (!rects.length || area > SCANNED) return;
  const layer = Object.assign(document.createElement('div'), { className: 'mg-img-restore' });
  for (const { sx, sy, sw, sh } of rects) {
    const c = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
    c.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    Object.assign(c.style, {
      left: `${(100 * sx) / canvas.width}%`,
      top: `${(100 * sy) / canvas.height}%`,
      width: `${(100 * sw) / canvas.width}%`,
      height: `${(100 * sh) / canvas.height}%`,
    });
    layer.append(c);
  }
  div.querySelector(':scope > .canvasWrapper')?.after(layer);
}

export function usePageTheme(
  ready: boolean,
  getViewer: () => Viewer | null,
  theme: ResolvedTheme,
  invertImages: boolean,
): void {
  useEffect(() => {
    const v = getViewer();
    if (!ready || !v) return;
    const apply = ({ pageNumber }: { pageNumber: number }) => {
      const pv = pageViewAt(v.viewer, pageNumber - 1);
      // PDF.js 6 types these as null/any; at runtime: the page's main canvas and the PDFPageProxy
      const canvas = (pv as unknown as { canvas?: HTMLCanvasElement | null } | undefined)?.canvas;
      if (!pv || !canvas?.width) return;
      clearRestore(pv.div);
      // sampling reads pixels back from the GPU: only the Dark theme needs it (T-403, NFR-PERF-02)
      const dark = theme === 'dark' && meanLuminance(canvas) < DARK_PAGE;
      pv.div.toggleAttribute('data-mg-dark', dark);
      const coords = (pv.pdfPage as { imageCoordinates?: ArrayLike<number> | null } | null)?.imageCoordinates;
      if (theme === 'dark' && !invertImages && !dark && coords?.length) restoreImages(pv.div, canvas, coords);
    };
    v.eventBus.on('pagerendered', apply);
    for (let i = 1; i <= v.viewer.pagesCount; i++) apply({ pageNumber: i }); // pages already rendered
    return () => v.eventBus.off('pagerendered', apply);
  }, [ready, getViewer, theme, invertImages]);
}
