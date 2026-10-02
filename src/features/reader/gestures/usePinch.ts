/**
 * Two-finger pinch zoom (FR-RDR-03, ADR 0003): compositor-only CSS transform on `.pdfViewer` during the
 * gesture, one PDFViewer.updateScale() on release (keeps the pinch midpoint fixed, then re-renders).
 * One-finger pans stay native (`touch-action: pan-x pan-y` on the scroller).
 */
import { useEffect, type RefObject } from 'react';
import { ZOOM_MAX, ZOOM_MIN, type Viewer } from '../pdf/viewer';

const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
const mid = (t: TouchList): [number, number] => [(t[0]!.clientX + t[1]!.clientX) / 2, (t[0]!.clientY + t[1]!.clientY) / 2];

/** Clamp a pinch factor so the committed scale stays within 50-400 %. */
export const clampFactor = (factor: number, current: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * factor)) / current;

export function usePinch(ready: boolean, getViewer: () => Viewer | null, container: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = container.current;
    const v = getViewer()?.viewer;
    if (!ready || !el || !v) return;
    const pages = v.viewer as HTMLDivElement; // the .pdfViewer element (typed as Element by PDF.js)
    let start: { d: number; origin: [number, number]; factor: number } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const origin = mid(e.touches);
      const box = pages.getBoundingClientRect();
      pages.style.transformOrigin = `${origin[0] - box.left}px ${origin[1] - box.top}px`;
      pages.style.willChange = 'transform';
      start = { d: dist(e.touches), origin, factor: 1 };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault(); // no browser page zoom
      start.factor = clampFactor(dist(e.touches) / start.d, v.currentScale);
      pages.style.transform = `scale(${start.factor})`;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      const { factor, origin } = start;
      start = null;
      pages.style.transform = '';
      pages.style.willChange = '';
      if (Math.abs(factor - 1) > 0.01) v.updateScale({ scaleFactor: factor, origin });
    };
    const preventGesture = (e: Event) => e.preventDefault(); // iOS Safari's own pinch (gesturestart)

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('gesturestart', preventGesture);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', preventGesture);
    };
  }, [ready, getViewer, container]);
}
