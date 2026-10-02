/**
 * Annotation commands with undo/redo (FR-HLT-01..04, FR-KEY-06). Writes go through annotationsRepo (rule 3);
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

const onLine = async (documentId: string, anchor: Anchor, kind: AnnotationKind) =>
  (await annotationsRepo.onPage(documentId, anchor.page)).filter((a) => a.kind === kind && intersects(a.anchor, anchor));

export type HighlightOp = 'created' | 'replaced' | 'removed';

/** Colour the line(s) of `anchor`: the same colour again removes it, another colour replaces it (FR-HLT-03). */
export const toggleHighlight = (documentId: string, anchor: Anchor, colorId: number): Promise<{ op: HighlightOp; command: Command }> =>
  serial(async () => {
    const hits = await onLine(documentId, anchor, 'highlight');
    const hit = hits.find((h) => h.colorId === colorId) ?? hits[0];
    if (!hit) {
      const row = await annotationsRepo.create({ id: crypto.randomUUID(), documentId, kind: 'highlight', page: anchor.page, anchor, colorId, body: null, label: null });
      return { op: 'created', command: record({ undo: () => annotationsRepo.remove(row.id), redo: () => annotationsRepo.restore(row.id) }) };
    }
    if (hit.colorId === colorId) {
      await annotationsRepo.remove(hit.id);
      return { op: 'removed', command: record({ undo: () => annotationsRepo.restore(hit.id), redo: () => annotationsRepo.remove(hit.id) }) };
    }
    const from = hit.colorId;
    await annotationsRepo.update(hit.id, { colorId });
    return {
      op: 'replaced',
      command: record({ undo: () => annotationsRepo.update(hit.id, { colorId: from }), redo: () => annotationsRepo.update(hit.id, { colorId }) }),
    };
  });

/** Delete/Backspace: tombstone the highlights on the selected line(s) as one undoable step (FR-HLT-04). */
export const removeHighlights = (documentId: string, anchor: Anchor): Promise<Command | null> =>
  serial(async () => {
    const ids = (await onLine(documentId, anchor, 'highlight')).map((h) => h.id);
    if (!ids.length) return null;
    for (const id of ids) await annotationsRepo.remove(id);
    return record({
      undo: async () => {
        for (const id of ids) await annotationsRepo.restore(id);
      },
      redo: async () => {
        for (const id of ids) await annotationsRepo.remove(id);
      },
    });
  });
