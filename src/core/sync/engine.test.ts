import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Anchor } from '../anchors/types';
import type { AnnotationRow, DocumentRow } from '../db/models';
import { AppDB, type OutboxEntity } from '../db/schema';
import { createSyncEngine, PULL_PAGE, type Cursor, type PushResult, type SyncTransport } from './engine';
import { KEY_OF, type ServerRow, type SyncTable } from './mapping';

const USER = '00000000-0000-4000-8000-00000000000a';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const anchor = (page = 1): Anchor => ({
  v: 1,
  page,
  rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }],
  quote: { exact: 'q', prefix: '', suffix: '' },
});
const iso = (ms: number) => new Date(ms).toISOString();

/** In-memory stand-in for PostgREST + the schema's triggers and constraints (PRD §9.1). */
class FakeServer implements SyncTransport {
  tables: Record<SyncTable, Map<string, ServerRow>> = {
    documents: new Map(),
    annotations: new Map(),
    reading_positions: new Map(),
    profiles: new Map(),
  };
  clock = Date.parse('2026-10-03T10:00:00Z');
  inject: ((table: SyncTable, rows: ServerRow[]) => PushResult | null) | null = null;
  pushes: { table: SyncTable; ids: string[] }[] = [];

  push(table: SyncTable, rows: ServerRow[]): Promise<PushResult> {
    const key = KEY_OF[table];
    this.pushes.push({ table, ids: rows.map((r) => String(r[key])) });
    const injected = this.inject?.(table, rows);
    if (injected) return Promise.resolve(injected);
    for (const r of rows) {
      if (
        (table === 'annotations' || table === 'reading_positions') &&
        !this.tables.documents.has(String(r.document_id))
      )
        return Promise.resolve({ ok: false, status: 409, code: '23503', message: 'foreign key violation' });
      if (
        table === 'documents' &&
        r.deleted_at == null &&
        [...this.tables.documents.values()].some(
          (d) => d.content_hash === r.content_hash && d.id !== r.id && d.deleted_at == null,
        )
      )
        return Promise.resolve({
          ok: false,
          status: 409,
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        });
      if (table === 'annotations' && r.kind === 'highlight' && r.color_id == null)
        return Promise.resolve({ ok: false, status: 400, code: '23514', message: 'check violation' });
    }
    const out = rows.map((r) => {
      this.clock += 1000; // trigger: clock_timestamp()
      const stored = {
        ...this.tables[table].get(String(r[key])),
        ...r,
        user_id: USER,
        updated_at: `${iso(this.clock).slice(0, -1)}123+00:00`,
      };
      this.tables[table].set(String(r[key]), stored);
      return stored;
    });
    return Promise.resolve({ ok: true, rows: out });
  }

  findLiveDocument(contentHash: string): Promise<ServerRow | null> {
    return Promise.resolve(
      [...this.tables.documents.values()].find((d) => d.content_hash === contentHash && d.deleted_at == null) ?? null,
    );
  }

  pull(table: SyncTable, after: Cursor | null, limit: number): Promise<ServerRow[]> {
    const key = KEY_OF[table];
    const t = (r: ServerRow) => Date.parse(String(r.updated_at));
    const rows = [...this.tables[table].values()]
      .sort((a, b) => t(a) - t(b) || String(a[key]).localeCompare(String(b[key])))
      .filter(
        (r) => !after || t(r) > Date.parse(after.ts) || (t(r) === Date.parse(after.ts) && String(r[key]) > after.key),
      );
    return Promise.resolve(rows.slice(0, limit));
  }
}

/** What a repository write does: row + coalesced outbox snapshot in one transaction (ADR 0007). */
async function write(
  d: AppDB,
  entity: OutboxEntity,
  row: DocumentRow | AnnotationRow,
  op: 'upsert' | 'delete' = 'upsert',
) {
  await d.transaction('rw', [d.documents, d.annotations, d.outbox], async () => {
    if (entity === 'document') await d.documents.put(row as DocumentRow);
    else await d.annotations.put(row as AnnotationRow);
    await d.outbox.where('[entity+entityId]').equals([entity, row.id]).delete();
    await d.outbox.add({
      entity,
      entityId: row.id,
      op,
      payload: row,
      attempts: 0,
      status: 'pending',
      createdAt: Date.now(),
    });
  });
}

const t0 = '2026-10-03T09:00:00.000Z';
const doc = (n: number, over: Partial<DocumentRow> = {}): DocumentRow => ({
  id: uuid(n),
  contentHash: n.toString(16).padStart(64, '0'),
  title: `Book ${n}`,
  author: null,
  pageCount: 10,
  fileSize: 1000,
  storageMode: 'cloud',
  storagePath: null,
  coverPath: null,
  lastOpenedAt: null,
  createdAt: t0,
  updatedAt: t0,
  deletedAt: null,
  localUpdatedAt: 0,
  ...over,
});
const note = (n: number, docN: number, over: Partial<AnnotationRow> = {}): AnnotationRow => ({
  id: uuid(1000 + n),
  documentId: uuid(docN),
  kind: 'highlight',
  page: 1,
  anchor: anchor(),
  colorId: 1,
  body: null,
  label: null,
  createdAt: t0,
  updatedAt: t0,
  deletedAt: null,
  localUpdatedAt: 0,
  ...over,
});

let server: FakeServer;
let A: AppDB;
let B: AppDB;
beforeEach(async () => {
  server = new FakeServer();
  A = new AppDB(`devA-${Math.random()}`);
  B = new AppDB(`devB-${Math.random()}`);
  await Promise.all([A.open(), B.open()]);
});
afterEach(async () => {
  await Promise.all([A.delete(), B.delete()]);
});

describe('push (FR-SYN-02/03)', () => {
  it('pushes FK parents first even when the document was re-saved after its annotations', async () => {
    await write(A, 'document', doc(1));
    await write(A, 'annotation', note(1, 1));
    await write(A, 'document', doc(1, { title: 'Renamed' })); // newer seq than the annotation
    expect(await createSyncEngine(server, USER, A).push()).toBe('done');
    expect(server.pushes.map((p) => p.table)).toEqual(['documents', 'annotations']);
    expect(await A.outbox.count()).toBe(0);
    expect(server.tables.documents.get(uuid(1))).toMatchObject({ title: 'Renamed', user_id: USER });
    expect(server.tables.documents.get(uuid(1))).not.toHaveProperty('updatedAt'); // never sent: the trigger owns it
  });

  it('takes the server updated_at back after a push', async () => {
    await write(A, 'document', doc(1));
    await createSyncEngine(server, USER, A).push();
    expect((await A.documents.get(uuid(1)))!.updatedAt).toBe('2026-10-03T10:00:01.000Z'); // server microseconds, kept to ms locally;
  });

  it('an edit made while the push was in flight stays pending', async () => {
    await write(A, 'document', doc(1));
    server.inject = () => {
      server.inject = null;
      void write(A, 'document', doc(1, { title: 'Edited mid-push' }));
      return null;
    };
    await createSyncEngine(server, USER, A).push();
    await new Promise((r) => setTimeout(r, 20));
    const left = await A.outbox.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'pending', payload: { title: 'Edited mid-push' } });
  });

  it('retryable errors keep items pending with attempts and the error; 401 asks for the session', async () => {
    await write(A, 'document', doc(1));
    server.inject = () => ({ ok: false, status: 503, message: 'unavailable' });
    expect(await createSyncEngine(server, USER, A).push()).toBe('retry');
    expect(await A.outbox.toArray()).toMatchObject([{ status: 'pending', attempts: 1, lastError: 'unavailable' }]);
    server.inject = () => ({ ok: false, status: 401, message: 'JWT expired' });
    expect(await createSyncEngine(server, USER, A).push()).toBe('auth');
    expect(await A.outbox.toArray()).toMatchObject([{ status: 'pending', attempts: 2 }]);
  });

  it('a permanent error isolates the bad row: the rest of the batch goes through, nothing is dropped', async () => {
    await write(A, 'document', doc(1));
    await write(A, 'annotation', note(1, 1));
    await write(A, 'annotation', note(2, 1, { colorId: null, kind: 'highlight' }));
    await write(A, 'annotation', note(3, 1));
    expect(await createSyncEngine(server, USER, A).push()).toBe('done');
    expect([...server.tables.annotations.keys()].sort()).toEqual([uuid(1001), uuid(1003)]);
    expect(await A.outbox.toArray()).toMatchObject([
      { entityId: uuid(1002), status: 'failed', lastError: 'check violation', attempts: 1 },
    ]);
    expect(await createSyncEngine(server, USER, A).push()).toBe('done'); // failed items wait for the Sync issues screen
    expect(await A.outbox.where('status').equals('failed').count()).toBe(1);
  });
});

describe('pull (FR-SYN-04)', () => {
  it('applies remote rows, saves a cursor, and pages through large tables', async () => {
    for (let i = 1; i <= PULL_PAGE + 20; i++)
      server.tables.annotations.set(uuid(1000 + i), {
        ...serverNote(i),
        updated_at: `${iso(Date.parse('2026-10-03T08:00:00Z') + i)}`,
      });
    server.tables.documents.set(uuid(1), serverDoc(1));
    await createSyncEngine(server, USER, B).pull();
    expect(await B.annotations.count()).toBe(PULL_PAGE + 20);
    expect(await B.documents.count()).toBe(1);
    expect((await B.meta.get('sync.cursor.annotations'))?.value).toMatchObject({ key: uuid(1000 + PULL_PAGE + 20) });
    await createSyncEngine(server, USER, B).pull(); // the 5 s overlap re-applies a few rows: idempotent
    expect(await B.annotations.count()).toBe(PULL_PAGE + 20);
  });

  it('never overwrites a row with a pending local edit; otherwise newer server rows win', async () => {
    await write(B, 'document', doc(1, { title: 'Local, unsent', updatedAt: '2026-10-03T07:00:00.000Z' }));
    await write(B, 'document', doc(2, { title: 'Local, sent', updatedAt: '2026-10-03T07:00:00.000Z' }));
    await B.outbox.filter((o) => o.entityId === uuid(2)).delete(); // pretend doc 2 was already pushed
    server.tables.documents.set(uuid(1), serverDoc(1, { title: 'Remote 1' }));
    server.tables.documents.set(uuid(2), serverDoc(2, { title: 'Remote 2' }));
    await createSyncEngine(server, USER, B).pull();
    expect((await B.documents.get(uuid(1)))!.title).toBe('Local, unsent');
    expect((await B.documents.get(uuid(2)))!.title).toBe('Remote 2');
  });

  it('ignores rows that fail the local schema instead of writing them', async () => {
    server.tables.documents.set(uuid(1), { ...serverDoc(1), content_hash: 'not-a-hash' });
    await createSyncEngine(server, USER, B).pull();
    expect(await B.documents.count()).toBe(0);
  });
});

describe('two devices, last write wins by server time (FR-SYN-08)', () => {
  it('concurrent edits: the later push wins everywhere', async () => {
    await write(A, 'document', doc(1));
    await write(A, 'annotation', note(1, 1, { colorId: 1 }));
    const a = createSyncEngine(server, USER, A);
    const b = createSyncEngine(server, USER, B);
    await a.push();
    await b.pull();
    await write(A, 'annotation', { ...(await A.annotations.get(uuid(1001)))!, colorId: 2 });
    await write(B, 'annotation', { ...(await B.annotations.get(uuid(1001)))!, colorId: 3 });
    await a.push();
    await b.push(); // B's write reaches the server last
    await a.pull();
    await b.pull();
    expect((await A.annotations.get(uuid(1001)))!.colorId).toBe(3);
    expect((await B.annotations.get(uuid(1001)))!.colorId).toBe(3);
  });

  it('edit vs delete, offline on both sides: whichever reaches the server last wins', async () => {
    await write(A, 'document', doc(1));
    await write(A, 'annotation', note(1, 1));
    const a = createSyncEngine(server, USER, A);
    const b = createSyncEngine(server, USER, B);
    await a.push();
    await b.pull();
    // both offline: A deletes, B recolours
    await write(
      A,
      'annotation',
      { ...(await A.annotations.get(uuid(1001)))!, deletedAt: '2026-10-03T11:00:00.000Z' },
      'delete',
    );
    await write(B, 'annotation', { ...(await B.annotations.get(uuid(1001)))!, colorId: 4 });
    await b.push();
    await a.push(); // the delete lands last
    await a.pull();
    await b.pull();
    expect((await B.annotations.get(uuid(1001)))!.deletedAt).not.toBeNull();
    expect((await A.annotations.get(uuid(1001)))!.deletedAt).not.toBeNull();
  });

  it('settings sync through profiles.settings, newest wins', async () => {
    await A.meta.put({
      key: 'settings',
      value: { settings: { theme: 'dark' }, updatedAt: '2026-10-03T09:00:00.000Z', localUpdatedAt: 1 },
    });
    await A.outbox.add({
      entity: 'settings',
      entityId: 'profile',
      op: 'upsert',
      payload: { settings: { theme: 'dark' } },
      attempts: 0,
      status: 'pending',
      createdAt: 1,
    });
    await createSyncEngine(server, USER, A).push();
    expect(server.tables.profiles.get(USER)).toMatchObject({ id: USER, settings: { theme: 'dark' } });
    await createSyncEngine(server, USER, B).pull();
    expect((await B.meta.get('settings'))?.value).toMatchObject({ settings: { theme: 'dark' } });
  });
});

describe('duplicate-document merge (FR-SYN-09)', () => {
  it('two devices add the same file offline: the second adopts the first id and keeps its annotations', async () => {
    const same = { contentHash: 'ab'.repeat(32) };
    await write(A, 'document', doc(1, same));
    await write(A, 'annotation', note(1, 1));
    await write(B, 'document', doc(2, same)); // same bytes, B's own id
    await write(B, 'annotation', note(2, 2, { kind: 'note', colorId: null, body: 'from B' }));
    await B.positions.put({
      documentId: uuid(2),
      page: 3,
      anchor: null,
      progress: 0.3,
      deviceId: 'b',
      deviceLabel: null,
      updatedAt: t0,
      localUpdatedAt: 0,
    });
    await B.outbox.add({
      entity: 'position',
      entityId: uuid(2),
      op: 'upsert',
      payload: { documentId: uuid(2), page: 3, anchor: null, progress: 0.3, deviceId: 'b', deviceLabel: null },
      attempts: 0,
      status: 'pending',
      createdAt: 0,
    });
    await B.files.put({ documentId: uuid(2), blob: new Blob(['%PDF']), size: 4, lastAccessAt: 0, pinned: false });

    await createSyncEngine(server, USER, A).push();
    expect(await createSyncEngine(server, USER, B).push()).toBe('done');

    expect(server.tables.documents.size).toBe(1);
    expect(server.tables.annotations.get(uuid(1002))).toMatchObject({ document_id: uuid(1), body: 'from B' });
    expect(server.tables.reading_positions.get(uuid(1))).toMatchObject({ page: 3 });
    expect((await B.documents.toArray()).map((d) => d.id)).toEqual([uuid(1)]);
    expect((await B.annotations.get(uuid(1002)))!.documentId).toBe(uuid(1));
    expect(await B.positions.get(uuid(1))).toMatchObject({ page: 3 });
    expect(await B.files.get(uuid(1))).toBeDefined();
    expect(await B.files.get(uuid(2))).toBeUndefined();
    expect(await B.outbox.count()).toBe(0);
  });
});

describe('stopped sync writes nothing (sign-out with data removal)', () => {
  it('a pull still running when sync stops applies nothing more, not even its cursor', async () => {
    server.tables.documents.set(uuid(1), serverDoc(1));
    let on = true;
    const engine = createSyncEngine(server, USER, B, () => on);
    const pull = server.pull.bind(server);
    server.pull = async (...args) => {
      const rows = await pull(...args);
      on = false; // sign-out lands while the rows are in flight
      await B.transaction('rw', B.tables, async () => {
        for (const t of B.tables) await t.clear();
      });
      return rows;
    };
    await engine.pull();
    for (const t of B.tables) expect(await t.count(), t.name).toBe(0);
  });
});

describe('a book deleted on another device (FR-LIB-07)', () => {
  it('pulling its tombstone removes the local file and cover', async () => {
    await B.documents.put(doc(1));
    await B.files.put({ documentId: uuid(1), blob: new Blob(['%PDF']), size: 4, lastAccessAt: 0, pinned: false });
    await B.covers.put({ documentId: uuid(1), blob: new Blob(['c']) });
    server.tables.documents.set(
      uuid(1),
      serverDoc(1, { deleted_at: '2026-10-03T09:30:00+00:00', updated_at: '2026-10-03T09:30:00+00:00' }),
    );
    await createSyncEngine(server, USER, B).pull();
    expect((await B.documents.get(uuid(1)))!.deletedAt).not.toBeNull();
    expect(await B.files.count()).toBe(0);
    expect(await B.covers.count()).toBe(0);
  });
});

function serverDoc(n: number, over: Record<string, unknown> = {}): ServerRow {
  return {
    id: uuid(n),
    user_id: USER,
    content_hash: n.toString(16).padStart(64, '0'),
    title: `Book ${n}`,
    author: null,
    page_count: 10,
    file_size: 1000,
    storage_mode: 'cloud',
    storage_path: null,
    cover_path: null,
    last_opened_at: null,
    created_at: '2026-10-03T06:00:00+00:00',
    updated_at: '2026-10-03T08:00:00.000001+00:00',
    deleted_at: null,
    ...over,
  };
}
function serverNote(n: number): ServerRow {
  return {
    id: uuid(1000 + n),
    user_id: USER,
    document_id: uuid(1),
    kind: 'highlight',
    page: 1,
    anchor: anchor(),
    color_id: 1,
    body: null,
    label: null,
    created_at: '2026-10-03T06:00:00+00:00',
    deleted_at: null,
  };
}
