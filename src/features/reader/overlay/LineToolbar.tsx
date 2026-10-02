import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fromCanonical } from '../../../core/anchors/geometry';
import { en } from '../../../shared/i18n/en';
import type { Selection } from '../store';

/**
 * Floating line toolbar (FR-LIN-01, §10.2): above the line for taps and mouse selections, below touch selections
 * (native callouts sit above them, ADR 0004). Lives in the page's over-host, so it scrolls with the page.
 */
export function LineToolbar({ host, rotation, selection, children }: { host: HTMLElement; rotation: number; selection: Selection; children: ReactNode }) {
  const rects = selection.anchor.rects;
  const below = selection.kind === 'range' && selection.touch;
  const r = fromCanonical((below ? rects.at(-1) : rects[0]) ?? { x: 0, y: 0, w: 1, h: 0 }, rotation);
  const style: CSSProperties = {
    ...(r.x + r.w / 2 < 0.5 ? { left: `${r.x * 100}%` } : { right: `${(1 - r.x - r.w) * 100}%` }), // stay on the page
    ...(below ? { top: `calc(${(r.y + r.h) * 100}% + 8px)` } : { top: `${r.y * 100}%`, transform: 'translateY(calc(-100% - 8px))' }),
  };
  return createPortal(
    <div
      role="toolbar"
      aria-label={en.reader.lineActions}
      className="mg-toolbar"
      style={style}
      onPointerDown={(e) => e.preventDefault()} // keep the native selection and focus where they are
    >
      {children}
    </div>,
    host,
  );
}
