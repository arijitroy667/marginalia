import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Anchor } from '../anchors/types';
import { annotationsRepo, documentsRepo, positionsRepo, settingsRepo } from './repos';
import { db } from './schema';

const hash = (c: string) => c.repeat(64);
const newDoc = (over: Partial<Parameters<typeof documentsRepo.create>[0]> = {}) => ({
  id: crypto.randomUUID(),
  contentHash: hash('a'),
  title: 'Book',
  author: null,
  pageCount: 10,
  fileSize: 1000,
  storageMode: 'cloud' as const,
  storagePath: null,
  coverPath: null,
  ...over,
});
const anchor = (page = 1): Anchor => ({ v: 1, page, rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }], quote: { exact: 'q', prefix: '', suffix: '' } });

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.restoreAllMocks());

describe('schema', () => {
  it('opens version 1 with every PRD table', () => {
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['annotations', 'covers', 'documents', 'files', 'lineCache', 'meta', 'outbox', 'positions'].sort(),
    );
  });
});

describe('documentsRepo', () => {
  it('writes the row and its outbox snapshot together (FR-SYN-02)', async () => {
    const row = await documentsRepo.create(newDoc());
    expect(await db.documents.get(row.id)).toEqual(row);
    const out = await db.outbox.toArray();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ entity: 'document', entityId: row.id, op: 'upsert', status: 'pending', attempts: 0, payload: row });
  });

  it('rolls back the row if the outbox write fails (atomicity)', async () => {
    vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const input = newDoc();
    await expect(documentsRepo.create(input)).rejects.toThrow('QuotaExceededError');
    expect(await db.documents.get(input.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it('coalesces repeated updates of one entity into its newest snapshot', async () => {
    const row = await documentsRepo.create(newDoc());
    await documentsRepo.update(row.id, { title: 'B2' });
    await documentsRepo.update(row.id, { title: 'B3' });
    const out = await db.outbox.toArray();
    expect(out).toHaveLength(1);
    expect((out[0]!.payload as { title: string }).title).toBe('B3');
  });

  it('soft-deletes as a tombstone and dedupes by hash on live rows only', async () => {
    const row = await documentsRepo.create(newDoc());
    expect((await documentsRepo.findByHash(hash('a')))?.id).toBe(row.id);
    const dead = await documentsRepo.softDelete(row.id);
    expect(dead.deletedAt).not.toBeNull();
    expect((await db.outbox.toArray())[0]?.op).toBe('delete');
    expect(await documentsRepo.findByHash(hash('a'))).toBeUndefined();
  });

  it('rejects invalid rows before touching the database', async () => {
    await expect(documentsRepo.create(newDoc({ contentHash: 'nothex' }))).rejects.toThrow();
    expect(await db.documents.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('annotationsRepo', () => {
  it('mirrors SQL constraints: highlight needs a colour, page must match the anchor', async () => {
    const doc = await documentsRepo.create(newDoc());
    const base = { id: crypto.randomUUID(), documentId: doc.id, body: null, label: null };
    await expect(annotationsRepo.create({ ...base, kind: 'highlight', page: 1, anchor: anchor(1), colorId: null })).rejects.toThrow();
    await expect(annotationsRepo.create({ ...base, kind: 'bookmark', page: 2, anchor: anchor(1), colorId: null })).rejects.toThrow();
    expect(await db.annotations.count()).toBe(0);
  });

  it('remove tombstones and restore brings back the same id (FR-KEY-06)', async () => {
    const doc = await documentsRepo.create(newDoc());
    const a = await annotationsRepo.create({ id: crypto.randomUUID(), documentId: doc.id, kind: 'highlight', page: 1, anchor: anchor(1), colorId: 2, body: null, label: null });
    await annotationsRepo.remove(a.id);
    expect((await db.annotations.get(a.id))?.deletedAt).not.toBeNull();
    const back = await annotationsRepo.restore(a.id);
    expect(back.id).toBe(a.id);
    expect(back.deletedAt).toBeNull();
    const out = await db.outbox.where('[entity+entityId]').equals(['annotation', a.id]).toArray();
    expect(out).toHaveLength(1);
    expect(out[0]!.op).toBe('upsert');
  });

  it('keeps outbox order across entities (seq increases)', async () => {
    const doc = await documentsRepo.create(newDoc());
    await annotationsRepo.create({ id: crypto.randomUUID(), documentId: doc.id, kind: 'note', page: 1, anchor: anchor(1), colorId: null, body: 'n', label: null });
    const seqs = (await db.outbox.orderBy('seq').toArray()).map((o) => o.entity);
    expect(seqs).toEqual(['document', 'annotation']); // documents push before their children (FK)
  });
});

describe('positionsRepo / settingsRepo', () => {
  it('one position row per document, upserted', async () => {
    const doc = await documentsRepo.create(newDoc());
    const p = { documentId: doc.id, anchor: null, deviceId: 'dev', deviceLabel: null };
    await positionsRepo.save({ ...p, page: 2, progress: 0.2 });
    await positionsRepo.save({ ...p, page: 5, progress: 0.5 });
    expect(await db.positions.count()).toBe(1);
    expect((await db.positions.get(doc.id))?.page).toBe(5);
    expect(await db.outbox.where('entity').equals('position').count()).toBe(1);
  });

  it('settings default, persist, enqueue, and keep unknown keys', async () => {
    expect((await settingsRepo.get()).theme).toBe('system');
    await settingsRepo.update({ theme: 'warm', futureKey: 1 } as never);
    const s = await settingsRepo.get();
    expect(s.theme).toBe('warm');
    expect((s as Record<string, unknown>).futureKey).toBe(1);
    expect(await db.outbox.where('entity').equals('settings').count()).toBe(1);
  });
});
