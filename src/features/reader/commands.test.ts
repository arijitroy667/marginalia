import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Anchor, NRect } from '../../core/anchors/types';
import { db } from '../../core/db/schema';
import {
  clearHistory,
  closeNote,
  HISTORY_LIMIT,
  noteSession,
  redo,
  removeAnnotation,
  removeOnLine,
  saveNote,
  setLabel,
  toggleBookmark,
  toggleHighlight,
  undo,
  undoCommand,
} from './commands';

const DOC = '00000000-0000-4000-8000-000000000001';
const line = (y: number, x = 0.1, w = 0.35): NRect => ({ x, y, w, h: 0.02 });
const at = (...rects: NRect[]): Anchor => ({ v: 1, page: 1, rects, quote: { exact: 'q', prefix: '', suffix: '' } });
const live = async () => (await db.annotations.toArray()).filter((a) => a.deletedAt === null);

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearHistory();
});

describe('toggleHighlight (FR-HLT-01/03)', () => {
  it('creates, then the same colour removes (tombstone + delete op), another colour replaces', async () => {
    expect((await toggleHighlight(DOC, at(line(0.2)), 1)).op).toBe('created');
    const [row] = await live();
    expect(row).toMatchObject({ kind: 'highlight', colorId: 1, page: 1, documentId: DOC });

    expect((await toggleHighlight(DOC, at(line(0.2)), 3)).op).toBe('replaced');
    expect(await live()).toMatchObject([{ id: row!.id, colorId: 3 }]);

    expect((await toggleHighlight(DOC, at(line(0.2)), 3)).op).toBe('removed');
    expect(await live()).toEqual([]);
    expect((await db.annotations.get(row!.id))!.deletedAt).not.toBeNull();
    expect(await db.outbox.where('[entity+entityId]').equals(['annotation', row!.id]).toArray()).toMatchObject([
      { op: 'delete' },
    ]);
  });

  it('a sub-line selection matches the highlighted line; the other column and the next line do not', async () => {
    await toggleHighlight(DOC, at(line(0.2)), 1);
    expect((await toggleHighlight(DOC, at({ x: 0.2, y: 0.202, w: 0.1, h: 0.015 }), 2)).op).toBe('replaced');
    expect((await toggleHighlight(DOC, at(line(0.2, 0.55)), 2)).op).toBe('created'); // right column, same height
    expect((await toggleHighlight(DOC, at(line(0.22)), 2)).op).toBe('created'); // next line
    expect(await live()).toHaveLength(3);
  });

  it('runs one command at a time: a double press never creates two rows', async () => {
    const [a, b] = await Promise.all([toggleHighlight(DOC, at(line(0.4)), 1), toggleHighlight(DOC, at(line(0.4)), 1)]);
    expect([a.op, b.op]).toEqual(['created', 'removed']);
    expect(await db.annotations.count()).toBe(1);
  });
});

describe('undo / redo (FR-KEY-06)', () => {
  it('undoes and redoes create, replace and remove; undoing a delete restores the same id', async () => {
    await toggleHighlight(DOC, at(line(0.2)), 1);
    const id = (await live())[0]!.id;
    await toggleHighlight(DOC, at(line(0.2)), 2);
    await toggleHighlight(DOC, at(line(0.2)), 2); // removed

    expect(await undo()).toBe(true);
    expect(await live()).toMatchObject([{ id, colorId: 2 }]);
    expect(await undo()).toBe(true);
    expect(await live()).toMatchObject([{ id, colorId: 1 }]);
    expect(await undo()).toBe(true);
    expect(await live()).toEqual([]);
    expect(await undo()).toBe(false);

    expect(await redo()).toBe(true);
    expect(await live()).toMatchObject([{ id, colorId: 1 }]);
    expect(await redo()).toBe(true);
    expect(await redo()).toBe(true);
    expect(await live()).toEqual([]);
    expect(await redo()).toBe(false);
  });

  it('a new command clears the redo stack', async () => {
    await toggleHighlight(DOC, at(line(0.2)), 1);
    await undo();
    await toggleHighlight(DOC, at(line(0.3)), 1);
    expect(await redo()).toBe(false);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, async () => {
    for (let i = 0; i <= HISTORY_LIMIT; i++) await toggleHighlight(DOC, at(line(i * 0.019)), 1);
    let n = 0;
    while (await undo()) n++;
    expect(n).toBe(HISTORY_LIMIT);
    expect(await live()).toHaveLength(1); // the oldest step fell off the stack
  });

  it("a toast's Undo reverts its own step even after newer ones; the latest step stays redoable", async () => {
    const a = await toggleHighlight(DOC, at(line(0.2)), 1);
    const b = await toggleHighlight(DOC, at(line(0.3)), 1);
    await undoCommand(a.command);
    expect(await live()).toMatchObject([{ anchor: { rects: [line(0.3)] } }]);
    await undoCommand(a.command); // already undone: no-op
    expect(await live()).toHaveLength(1);
    await undoCommand(b.command);
    expect(await live()).toEqual([]);
    expect(await redo()).toBe(true); // b again
    expect(await live()).toHaveLength(1);
    expect(await redo()).toBe(false); // a was not the latest step
  });

  it('Delete removes every highlight and bookmark on the line as one step', async () => {
    await toggleHighlight(DOC, at(line(0.5, 0.1, 0.1)), 1);
    await toggleHighlight(DOC, at(line(0.5, 0.3, 0.1)), 2);
    await toggleBookmark(DOC, at(line(0.5)), 'mark');
    expect((await removeOnLine(DOC, at(line(0.5, 0.1, 0.4))))?.kinds.sort()).toEqual(['bookmark', 'highlight']);
    expect(await live()).toEqual([]);
    await undo();
    expect(await live()).toHaveLength(3);
    expect(await removeOnLine(DOC, at(line(0.7)))).toBeNull();
  });
});

describe('bookmarks (FR-BKM-01/02)', () => {
  it('B on a line bookmarks it, B again removes it; independent of a highlight on the same line', async () => {
    await toggleHighlight(DOC, at(line(0.3)), 1);
    expect((await toggleBookmark(DOC, at(line(0.3)), 'The first sixty characters')).op).toBe('created');
    const rows = await live(); // primary-key (random uuid) order
    expect(rows.map((a) => a.kind).sort()).toEqual(['bookmark', 'highlight']);
    expect(rows.find((a) => a.kind === 'bookmark')).toMatchObject({
      label: 'The first sixty characters',
      colorId: null,
    });
    expect((await toggleBookmark(DOC, at(line(0.3)), 'ignored')).op).toBe('removed');
    expect((await live()).map((a) => a.kind)).toEqual(['highlight']);
    await undo(); // undoing the removal restores the same row
    expect((await live()).map((a) => a.label).sort()).toEqual([null, 'The first sixty characters'].sort());
  });

  it('label edits are undoable', async () => {
    await toggleBookmark(DOC, at(line(0.3)), 'old');
    const id = (await live())[0]!.id;
    await setLabel(id, 'old', 'new');
    expect((await live())[0]!.label).toBe('new');
    await undo();
    expect((await live())[0]!.label).toBe('old');
  });
});

describe('notes (FR-NOT-01, FR-KEY-06)', () => {
  const notes = async () => (await live()).filter((a) => a.kind === 'note');

  it('autosave creates the row with the first text; closing makes the session one undo step', async () => {
    const st = noteSession(null);
    await saveNote(DOC, at(line(0.3)), st, '');
    expect(await notes()).toEqual([]); // nothing typed yet: nothing stored
    await saveNote(DOC, at(line(0.3)), st, 'First');
    await saveNote(DOC, at(line(0.3)), st, 'First thought');
    await closeNote(DOC, at(line(0.3)), st, 'First thought, final');
    expect(await notes()).toMatchObject([{ body: 'First thought, final', colorId: null, page: 1 }]);
    await undo(); // the whole session
    expect(await notes()).toEqual([]);
    await redo();
    expect(await notes()).toHaveLength(1);
  });

  it('a new note left empty is discarded silently, even after an autosave', async () => {
    const st = noteSession(null);
    await saveNote(DOC, at(line(0.3)), st, 'x');
    await closeNote(DOC, at(line(0.3)), st, '   ');
    expect(await notes()).toEqual([]);
    expect(await undo()).toBe(false); // not an undo step
  });

  it('editing an existing note is one step back to the original; emptying it without the delete keeps it', async () => {
    const first = noteSession(null);
    await closeNote(DOC, at(line(0.3)), first, 'original');
    const row = (await notes())[0]!;
    const edit = noteSession(row);
    await saveNote(DOC, at(line(0.3)), edit, 'changed');
    await closeNote(DOC, at(line(0.3)), edit, 'changed again');
    expect((await notes())[0]!.body).toBe('changed again');
    await undo();
    expect((await notes())[0]!.body).toBe('original');

    const cleared = noteSession((await notes())[0]!);
    await saveNote(DOC, at(line(0.3)), cleared, '');
    await closeNote(DOC, at(line(0.3)), cleared, '');
    expect((await notes())[0]!.body).toBe('original');
  });

  it('a confirmed delete is undoable and the closing editor does not resurrect it', async () => {
    await closeNote(DOC, at(line(0.3)), noteSession(null), 'to delete');
    const st = noteSession((await notes())[0]!);
    st.deleted = true;
    await removeAnnotation(st.id!);
    await closeNote(DOC, at(line(0.3)), st, 'to delete');
    expect(await notes()).toEqual([]);
    await undo();
    expect(await notes()).toMatchObject([{ body: 'to delete' }]);
  });
});
