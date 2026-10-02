/**
 * Annotation commands with undo/redo (FR-HLT-01..04, FR-BKM-01/02, FR-KEY-06). Writes go through annotationsRepo (rule 3);
 * undoing a delete restores the same id, so devices converge. History: 50 steps, in memory. Commands run one
 * at a time, so a fast double key press can never create the same highlight twice.
 */
import { intersects } from '../../core/anchors/anchor';
import type { Anchor } from '../../core/anchors/types';
import type { AnnotationKind } from '../../core/db/models';
import { annotationsRepo } from '../../core/db/repos';

export interface Command {
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
}

export const HISTORY_LIMIT = 50;
let done: Command[] = [];
let undone: Command[] = [];
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function record(c: Command): Command {
  done = [...done, c].slice(-HISTORY_LIMIT);
  undone = [];
  return c;
}

/** Ctrl/Cmd+Z. Resolves false when there is nothing to undo. */
export const undo = (): Promise<boolean> =>
  serial(async () => {
    const c = done.pop();
    if (!c) return false;
    await c.undo();
    undone.push(c);
    return true;
  });

/** Ctrl/Cmd+Shift+Z. */
export const redo = (): Promise<boolean> =>
  serial(async () => {
    const c = undone.pop();
    if (!c) return false;
    await c.redo();
    done.push(c);
    return true;
  });

/** A toast's Undo: reverts that command even if newer ones followed (then it is not redoable); no-op if already undone. */
export const undoCommand = (c: Command): Promise<void> =>
  serial(async () => {
    const i = done.lastIndexOf(c);
    if (i < 0) return;
    done.splice(i, 1);
    await c.undo();
    if (i === done.length) undone.push(c); // it was the latest step: same as Ctrl/Cmd+Z
  });

/** A new document starts a new history. */
export function clearHistory(): void {
  done = [];
  undone = [];
}

const onLine = async (documentId: string, anchor: Anchor, ...kinds: AnnotationKind[]) =>
  (await annotationsRepo.onPage(documentId, anchor.page)).filter(
    (a) => kinds.includes(a.kind) && intersects(a.anchor, anchor),
  );

const created = (id: string) =>
  record({ undo: () => annotationsRepo.remove(id), redo: () => annotationsRepo.restore(id) });
const removed = async (id: string) => {
  await annotationsRepo.remove(id);
  return record({ undo: () => annotationsRepo.restore(id), redo: () => annotationsRepo.remove(id) });
};

export type HighlightOp = 'created' | 'replaced' | 'removed';

/** Colour the line(s) of `anchor`: the same colour again removes it, another colour replaces it (FR-HLT-03). */
export const toggleHighlight = (
  documentId: string,
  anchor: Anchor,
  colorId: number,
): Promise<{ op: HighlightOp; command: Command }> =>
  serial(async () => {
    const hits = await onLine(documentId, anchor, 'highlight');
    const hit = hits.find((h) => h.colorId === colorId) ?? hits[0];
    if (!hit) {
      const row = await annotationsRepo.create({
        id: crypto.randomUUID(),
        documentId,
        kind: 'highlight',
        page: anchor.page,
        anchor,
        colorId,
        body: null,
        label: null,
      });
      return { op: 'created', command: created(row.id) };
    }
    if (hit.colorId === colorId) return { op: 'removed', command: await removed(hit.id) };
    const from = hit.colorId;
    await annotationsRepo.update(hit.id, { colorId });
    return {
      op: 'replaced',
      command: record({
        undo: () => annotationsRepo.update(hit.id, { colorId: from }),
        redo: () => annotationsRepo.update(hit.id, { colorId }),
      }),
    };
  });

/** Quick bookmark (FR-BKM-01): bookmark the line, or remove the bookmark already on it. */
export const toggleBookmark = (
  documentId: string,
  anchor: Anchor,
  label: string | null,
): Promise<{ op: 'created' | 'removed'; command: Command }> =>
  serial(async () => {
    const hit = (await onLine(documentId, anchor, 'bookmark'))[0];
    if (hit) return { op: 'removed', command: await removed(hit.id) };
    const row = await annotationsRepo.create({
      id: crypto.randomUUID(),
      documentId,
      kind: 'bookmark',
      page: anchor.page,
      anchor,
      colorId: null,
      body: null,
      label,
    });
    return { op: 'created', command: created(row.id) };
  });

/** Bookmark label edit (FR-BKM-02); `null` falls back to the line's quote in lists. */
export const setLabel = (id: string, from: string | null, to: string | null): Promise<Command> =>
  serial(async () => {
    await annotationsRepo.update(id, { label: to });
    return record({
      undo: () => annotationsRepo.update(id, { label: from }),
      redo: () => annotationsRepo.update(id, { label: to }),
    });
  });

/** Tombstone one annotation (marker popover Delete), undoable. */
export const removeAnnotation = (id: string): Promise<Command> => serial(() => removed(id));

/** Delete/Backspace: tombstone the highlights and bookmarks on the selected line(s) as one step (FR-HLT-04). */
export const removeOnLine = (
  documentId: string,
  anchor: Anchor,
): Promise<{ command: Command; kinds: AnnotationKind[] } | null> =>
  serial(async () => {
    const hits = await onLine(documentId, anchor, 'highlight', 'bookmark');
    const ids = hits.map((h) => h.id);
    if (!ids.length) return null;
    for (const id of ids) await annotationsRepo.remove(id);
    const command = record({
      undo: async () => {
        for (const id of ids) await annotationsRepo.restore(id);
      },
      redo: async () => {
        for (const id of ids) await annotationsRepo.remove(id);
      },
    });
    return { command, kinds: [...new Set(hits.map((h) => h.kind))] };
  });

/** One open note editor (FR-NOT-01). `original` is null for a note created in this session. */
export interface NoteSession {
  id: string | null;
  original: string | null;
  saved: string;
  deleted: boolean;
}

export const noteSession = (note: { id: string; body: string | null } | null): NoteSession => ({
  id: note?.id ?? null,
  original: note ? (note.body ?? '') : null,
  saved: note?.body ?? '',
  deleted: false,
});

async function writeNote(documentId: string, anchor: Anchor, st: NoteSession, body: string): Promise<void> {
  if (!body.trim() || body === st.saved || st.deleted) return; // an empty note is never stored
  if (st.id) await annotationsRepo.update(st.id, { body });
  else
    st.id = (
      await annotationsRepo.create({
        id: crypto.randomUUID(),
        documentId,
        kind: 'note',
        page: anchor.page,
        anchor,
        colorId: null,
        body,
        label: null,
      })
    ).id;
  st.saved = body;
}

/** Autosave while typing (500 ms debounce, blur): the row appears with the first non-empty text. Not an undo step. */
export const saveNote = (documentId: string, anchor: Anchor, st: NoteSession, body: string): Promise<void> =>
  serial(() => writeNote(documentId, anchor, st, body));

/**
 * Closing the editor saves the last text and makes the whole session one undo step. A new note left empty is
 * discarded silently; an existing note emptied without confirming the delete keeps its stored text.
 */
export const closeNote = (documentId: string, anchor: Anchor, st: NoteSession, body: string): Promise<void> =>
  serial(async () => {
    if (st.deleted) return;
    if (!body.trim()) {
      if (st.original === null && st.id) await annotationsRepo.remove(st.id);
      return;
    }
    await writeNote(documentId, anchor, st, body);
    const id = st.id;
    if (!id) return;
    if (st.original === null) created(id);
    else if (body !== st.original) {
      const from = st.original;
      record({
        undo: () => annotationsRepo.update(id, { body: from }),
        redo: () => annotationsRepo.update(id, { body }),
      });
    }
  });
