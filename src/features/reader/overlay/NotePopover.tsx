import { Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NOTE_AUTOSAVE_MS } from '../../../config';
import { fromCanonical } from '../../../core/anchors/geometry';
import type { Anchor } from '../../../core/anchors/types';
import type { AnnotationRow } from '../../../core/db/models';
import { en } from '../../../shared/i18n/en';
import { isPrimaryChord } from '../../../shared/utils/keys';
import { toast } from '../../../shared/ui/toast';
import { closeNote, noteSession, removeAnnotation, saveNote, type NoteSession } from '../commands';
import { undoable } from '../LineActions';
import { useReaderStore } from '../store';

const close = () => useReaderStore.getState().closeNotes();

/**
 * One note (FR-NOT-01): autosave 500 ms after typing and on blur; closing (Esc, outside click, Ctrl/Cmd+Enter) saves.
 * Emptying an existing note, or its Delete button, asks first (PRD §10.1); an empty new note is dropped silently.
 */
function NoteEditor({ documentId, anchor, note }: { documentId: string; anchor: Anchor; note: AnnotationRow | null }) {
  const [text, setText] = useState(note?.body ?? '');
  const [confirming, setConfirming] = useState(false);
  const session = useRef<NoteSession | null>(null);
  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const t = timer;
    const s = session;
    const l = latest;
    return () => {
      clearTimeout(t.current);
      void closeNote(documentId, anchor, (s.current ??= noteSession(note)), l.current).catch(() =>
        toast(en.reader.saveFailed),
      );
    };
  }, [documentId, anchor, note]);

  const change = (value: string) => {
    setText(value);
    latest.current = value;
    setConfirming(note !== null && !value.trim()); // clearing a stored note is a delete: ask
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        void saveNote(documentId, anchor, (session.current ??= noteSession(note)), value).catch(() =>
          toast(en.reader.saveFailed),
        ),
      NOTE_AUTOSAVE_MS,
    );
  };
  const keep = () => {
    if (!latest.current.trim()) change(note?.body ?? '');
    setConfirming(false);
  };
  const remove = () => {
    if (!note) return;
    (session.current ??= noteSession(note)).deleted = true;
    clearTimeout(timer.current);
    void removeAnnotation(note.id).then(
      (c) => toast(en.reader.noteDeleted, undoable(c)),
      () => toast(en.reader.saveFailed),
    );
    close();
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label={en.reader.noteEditor}
        className="min-h-24 w-full resize-y rounded-md border border-line-strong bg-ui-bg p-2 text-sm text-ui-fg"
        placeholder={en.reader.notePlaceholder}
        maxLength={20_000}
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() =>
          void saveNote(documentId, anchor, (session.current ??= noteSession(note)), latest.current).catch(() =>
            toast(en.reader.saveFailed),
          )
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isPrimaryChord(e)) {
            e.preventDefault();
            close(); // saves on unmount
          }
        }}
      />
      {confirming ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1">{en.reader.deleteNoteConfirm}</span>
          <button className="min-h-11 rounded-md px-3 hover:bg-ui-bg" onClick={keep}>
            {en.reader.keepNote}
          </button>
          <button className="min-h-11 rounded-md px-3 font-medium text-accent hover:bg-ui-bg" onClick={remove}>
            {en.reader.deleteNote}
          </button>
        </div>
      ) : (
        note && (
          <button
            className="min-h-11 self-end rounded-md px-3 text-sm text-muted hover:bg-ui-bg"
            onClick={() => setConfirming(true)}
          >
            {en.reader.deleteNote}
          </button>
        )
      )}
    </div>
  );
}

/** Note popover anchored to the line (FR-NOT-01/03): quoted line (2-line clamp) and an editor per note. */
export function NotePopover({
  host,
  rotation,
  documentId,
  editor,
}: {
  host: HTMLElement;
  rotation: number;
  documentId: string;
  editor: { anchor: Anchor; rows: AnnotationRow[] };
}) {
  const r = fromCanonical(editor.anchor.rects[0] ?? { x: 0, y: 0, w: 1, h: 0 }, rotation);
  return (
    <Popover.Root open onOpenChange={(open) => !open && close()}>
      {createPortal(
        <Popover.Anchor
          className="mg-note-anchor"
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
        />,
        host,
      )}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label={en.reader.noteEditor}
          className="mg-popover mg-note-popover"
          onKeyDown={(e) => e.key === 'Escape' && close()} // also when a newer toast is Radix's top layer and takes the Esc
        >
          {editor.anchor.quote.exact && (
            <blockquote className="line-clamp-2 border-l-2 border-line pl-2 text-sm text-muted">
              {editor.anchor.quote.exact}
            </blockquote>
          )}
          {editor.rows.length ? (
            editor.rows.map((n) => <NoteEditor key={n.id} documentId={documentId} anchor={n.anchor} note={n} />)
          ) : (
            <NoteEditor documentId={documentId} anchor={editor.anchor} note={null} />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
