import { useRef } from 'react';
import { en } from '../../shared/i18n/en';

/**
 * Bottom-sheet grabber (PRD §10.3): drag up to expand, down to shrink or close, tap to toggle the height. Pointer
 * input acts on release (no reliance on a synthesised click after pointer capture); Enter/Space use the click.
 */
export function SheetHandle({
  full,
  onFull,
  onClose,
}: {
  full: boolean;
  onFull: (full: boolean) => void;
  onClose: () => void;
}) {
  const start = useRef<number | null>(null);
  return (
    <button
      aria-label={en.reader.resizePanel}
      aria-expanded={full}
      className="mg-sheet-handle"
      onPointerDown={(e) => {
        start.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const dy = e.clientY - start.current;
        start.current = null;
        if (dy < -24) onFull(true);
        else if (dy <= 24) onFull(!full);
        else if (full) onFull(false);
        else onClose();
      }}
      onPointerCancel={() => (start.current = null)}
      onClick={(e) => e.detail === 0 && onFull(!full)} // keyboard activation only
    />
  );
}
