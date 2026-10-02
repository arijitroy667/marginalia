import type { CSSProperties } from 'react';
import type { AnnotationRow } from '../../../core/db/models';
import { en } from '../../../shared/i18n/en';
import { NoteIcon } from '../../../shared/ui/icons';

/**
 * Gutter note indicator (FR-NOT-02): speech bubble or dot, filled with the line's highlight colour (the outline keeps
 * 3:1), a count badge when notes share the line; desktop hover previews the first 3 lines (FR-NOT-03).
 */
export function NoteMarker({
  notes,
  tint,
  look,
  onOpen,
}: {
  notes: AnnotationRow[];
  tint: number | null;
  look: 'bubble' | 'dot';
  onOpen: () => void;
}) {
  const preview = notes[0]?.body ?? '';
  return (
    <span className="mg-note">
      <button
        className="mg-note-btn"
        data-look={look}
        aria-label={en.reader.noteMarker(notes.length, preview)}
        style={tint ? ({ '--note-fill': `var(--hl-${tint}, transparent)` } as CSSProperties) : undefined}
        onClick={onOpen}
      >
        {look === 'dot' ? <span className="mg-dot" /> : <NoteIcon width={18} height={18} />}
        {notes.length > 1 && <span className="mg-badge">{notes.length}</span>}
      </button>
      <span className="mg-preview" aria-hidden="true">
        {preview}
      </span>
    </span>
  );
}
