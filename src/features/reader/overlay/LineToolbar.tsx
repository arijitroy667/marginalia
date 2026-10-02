import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fromCanonical } from '../../../core/anchors/geometry';
import { en } from '../../../shared/i18n/en';
import type { Selection } from '../store';

const NONE = { x: 0, y: 0, w: 1, h: 0 };

/**
 * Floating line toolbar (FR-LIN-01, §10.2), centred on the page above the line; below touch selections (native
 * callouts sit above them, ADR 0004). If that side is covered (overlay top bar, viewport edge) it takes the other.
 * Lives in the page's over-host, so it scrolls with the page.
 */
export function LineToolbar({
  host,
  rotation,
  selection,
  children,
}: {
  host: HTMLElement;
  rotation: number;
  selection: Selection;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rects = selection.anchor.rects;
  const top = fromCanonical(rects[0] ?? NONE, rotation).y;
  const last = fromCanonical(rects.at(-1) ?? NONE, rotation);
  const below = selection.kind === 'range' && selection.touch;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.toggle('mg-below', below);
    const r = el.getBoundingClientRect();
    if (!el.contains(document.elementFromPoint(r.left + r.width / 2, below ? r.bottom - 2 : r.top + 2)))
      el.classList.toggle('mg-below', !below);
  });

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label={en.reader.lineActions}
      className="mg-toolbar"
      style={{ '--line-top': `${top * 100}%`, '--line-bottom': `${(last.y + last.h) * 100}%` } as CSSProperties}
      onPointerDown={(e) => e.preventDefault()} // keep the native selection and focus where they are
    >
      {children}
    </div>,
    host,
  );
}
