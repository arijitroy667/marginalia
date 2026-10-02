import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Anchor, NRect } from '../../core/anchors/types';
import { db } from '../../core/db/schema';
import { clearHistory, HISTORY_LIMIT, redo, removeHighlights, toggleHighlight, undo, undoCommand } from './commands';

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
    expect(await db.outbox.where('[entity+entityId]').equals(['annotation', row!.id]).toArray()).toMatchObject([{ op: 'delete' }]);
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

  it('Delete removes every highlight on the line as one step', async () => {
    await toggleHighlight(DOC, at(line(0.5, 0.1, 0.1)), 1);
    await toggleHighlight(DOC, at(line(0.5, 0.3, 0.1)), 2);
    expect(await removeHighlights(DOC, at(line(0.5, 0.1, 0.4)))).not.toBeNull();
    expect(await live()).toEqual([]);
    await undo();
    expect(await live()).toHaveLength(2);
    expect(await removeHighlights(DOC, at(line(0.7)))).toBeNull();
  });
});
