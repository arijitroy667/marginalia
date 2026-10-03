import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Anchor } from '../anchors/types';
import {
  annotationsRepo,
  cacheBudget,
  documentsRepo,
  evictable,
  filesRepo,
  localData,
  metaRepo,
  outboxRepo,
  positionsRepo,
  settingsRepo,
} from './repos';
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
const anchor = (page = 1): Anchor => ({
  v: 1,
  page,
  rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }],
  quote: { exact: 'q', prefix: '', suffix: '' },
});

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
    expect(out[0]).toMatchObject({
      entity: 'document',
      entityId: row.id,
      op: 'upsert',
      status: 'pending',
      attempts: 0,
      payload: row,
    });
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
    await expect(
      annotationsRepo.create({ ...base, kind: 'highlight', page: 1, anchor: anchor(1), colorId: null }),
    ).rejects.toThrow();
    await expect(
      annotationsRepo.create({ ...base, kind: 'bookmark', page: 2, anchor: anchor(1), colorId: null }),
    ).rejects.toThrow();
    expect(await db.annotations.count()).toBe(0);
  });

  it('remove tombstones and restore brings back the same id (FR-KEY-06)', async () => {
    const doc = await documentsRepo.create(newDoc());
    const a = await annotationsRepo.create({
      id: crypto.randomUUID(),
      documentId: doc.id,
      kind: 'highlight',
      page: 1,
      anchor: anchor(1),
      colorId: 2,
      body: null,
      label: null,
    });
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
    await annotationsRepo.create({
      id: crypto.randomUUID(),
      documentId: doc.id,
      kind: 'note',
      page: 1,
      anchor: anchor(1),
      colorId: null,
      body: 'n',
      label: null,
    });
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

  it('palette defaults to the five meanings and rejects bad entries (FR-HLT-02)', async () => {
    expect((await settingsRepo.get()).palette.map((p) => p.label)).toEqual([
      'Key idea',
      'Definition',
      'Look up',
      'Disagree / doubt',
      'Revisit',
    ]);
    const long = { id: 1, hex: '#FFE066', label: 'x'.repeat(25) };
    await expect(settingsRepo.update({ palette: [long] })).rejects.toThrow();
    await expect(settingsRepo.update({ palette: [{ id: 1, hex: 'yellow', label: 'Key' }] })).rejects.toThrow();
    await expect(
      settingsRepo.update({
        palette: [
          { id: 2, hex: '#000000', label: 'a' },
          { id: 2, hex: '#FFFFFF', label: 'b' },
        ],
      }),
    ).rejects.toThrow();
    await settingsRepo.update({ palette: [{ id: 3, hex: '#7CC4F4', label: 'Look up' }] });
    expect((await settingsRepo.get()).palette).toEqual([{ id: 3, hex: '#7CC4F4', label: 'Look up' }]);
  });
});

describe('outboxRepo (FR-SYN-10)', () => {
  it('lists failed items, retries them as pending, discards one', async () => {
    const add = (status: 'pending' | 'failed') =>
      db.outbox.add({
        entity: 'document',
        entityId: crypto.randomUUID(),
        op: 'upsert',
        payload: {},
        attempts: 3,
        status,
        createdAt: 0,
      });
    const a = await add('failed');
    await add('pending');
    const c = await add('failed');
    expect((await outboxRepo.failed()).map((i) => i.seq)).toEqual([a, c]);
    await outboxRepo.retry(a);
    expect(await db.outbox.get(a)).toMatchObject({ status: 'pending', attempts: 0 });
    await outboxRepo.discard(c);
    expect(await db.outbox.get(c)).toBeUndefined();
    await add('failed');
    await outboxRepo.retryAll();
    expect(await outboxRepo.failed()).toEqual([]);
  });
});

describe('localData (FR-SYN-01)', () => {
  it('wipe removes every table, including the owner and the outbox', async () => {
    const doc = await documentsRepo.create(newDoc());
    await annotationsRepo.create({
      id: crypto.randomUUID(),
      documentId: doc.id,
      kind: 'note',
      page: 1,
      anchor: anchor(1),
      colorId: null,
      body: 'n',
      label: null,
    });
    await metaRepo.set('ownerUserId', 'u1');
    expect(await localData.outboxCount()).toBe(2);
    await localData.wipe();
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0);
  });
});

describe('file cache policy (FR-LIB-08)', () => {
  const f = (id: string, lastAccessAt: number, over: Partial<Parameters<typeof evictable>[0][0]> = {}) => ({
    id,
    size: 10,
    lastAccessAt,
    pinned: false,
    inCloud: true,
    ...over,
  });
  it('evicts least recently opened first, down to the doc and byte budgets', () => {
    expect(evictable([f('a', 3), f('b', 1), f('c', 2)], 2)).toEqual(['b']);
    expect(evictable([f('a', 3, { size: 60 }), f('b', 1, { size: 60 })], 5, 100)).toEqual(['b']);
    expect(evictable([f('a', 1), f('b', 2)], 5)).toEqual([]);
  });
  it('never evicts a pinned file or one that is not safely in the cloud', () => {
    expect(evictable([f('a', 1, { pinned: true }), f('b', 2, { inCloud: false }), f('c', 3)], 1)).toEqual(['c']);
    expect(evictable([f('a', 1, { inCloud: false }), f('b', 2, { inCloud: false })], 1)).toEqual([]); // over budget, kept
  });
  it('evict() keeps the file being read and device-only files', async () => {
    for (let i = 0; i < 7; i++) {
      const doc = await documentsRepo.create(
        newDoc({ contentHash: hash(String(i)), storagePath: i === 0 ? null : `u/${i}.pdf` }),
      );
      await filesRepo.put(doc.id, new Blob(['%PDF']));
      await db.files.update(doc.id, { lastAccessAt: i });
    }
    const ids = (await db.documents.toArray())
      .sort((a, b) => a.contentHash.localeCompare(b.contentHash))
      .map((d) => d.id);
    const evicted = await filesRepo.evict(ids[1]);
    expect(evicted).toEqual([ids[2], ids[3]]); // 0: device-only, 1: open now
    expect(await db.files.count()).toBe(5);
  });
});

describe('cacheBudget (FR-SET-02)', () => {
  it('defaults to 5 books / 500 MB and ignores invalid stored values', async () => {
    expect(await cacheBudget.get()).toEqual({ docs: 5, mb: 500 });
    await cacheBudget.set({ docs: 10, mb: 1000 });
    expect(await cacheBudget.get()).toEqual({ docs: 10, mb: 1000 });
    await metaRepo.set('cacheBudget', { docs: -1, mb: 'lots' });
    expect(await cacheBudget.get()).toEqual({ docs: 5, mb: 500 });
  });
});
