import { fromCanonical, toCanonical } from '../../../core/anchors/geometry';
import type { NRect } from '../../../core/anchors/types';

/** Page number and canonical normalised point under a pointer, or null off-page. */
export function pagePoint(
  e: { clientX: number; clientY: number; target: EventTarget | null },
  rotation: number,
): { page: number; x: number; y: number } | null {
  const pageEl = (e.target as Element | null)?.closest<HTMLElement>('.page[data-page-number]');
  if (!pageEl) return null;
  const r = pageEl.getBoundingClientRect();
  const c = toCanonical({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: 0, h: 0 }, rotation);
  return { page: Number(pageEl.dataset.pageNumber), x: c.x, y: c.y };
}

/** Canonical rect -> SVG rect attributes in a 0..1 viewBox (zoom never recomputes; rotation re-maps). */
export function svgRect(r: NRect, rotation: number) {
  const d = fromCanonical(r, rotation);
  return { x: d.x, y: d.y, width: d.w, height: d.h };
}
