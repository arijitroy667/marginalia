/**
 * Sync engine (PRD §8.8, FR-SYN-02..05, 08). Push: pending outbox items, FK parents first, batches of
 * PUSH_BATCH_SIZE, server timestamps written back; retryable errors keep items pending, permanent ones mark the
 * item `failed` (Sync issues, FR-SYN-10); nothing is dropped silently. Pull: keyset cursor (updated_at, key) per
 * table with a 5 s overlap at the start of each pull; rows with a pending outbox entry are never overwritten;
 * otherwise whole-row last-write-wins by server `updated_at` (FR-SYN-08). Transport-agnostic: Supabase lives in
 * supabaseTransport.ts; tests use an in-memory server.
 */
import { PULL_OVERLAP_MS, PUSH_BATCH_SIZE } from '../../config';
import type { StoredSettings } from '../db/repos';
import { db as appDb, type AppDB, type OutboxEntity, type OutboxItem } from '../db/schema';
import { fromServer, KEY_OF, PUSH_ORDER, TABLE_OF, toServer, type ServerRow, type SyncTable } from './mapping';

export const PULL_PAGE = 500;
const TABLES: SyncTable[] = ['documents', 'annotations', 'reading_positions', 'profiles'];

export type PushResult =
  | { ok: true; rows: ServerRow[] } // the stored rows (at least key + updated_at)
  | { ok: false; status: number; code?: string | undefined; message: string };

export interface Cursor {
  ts: string; // server updated_at, full precision
  key: string;
}

export interface SyncTransport {
  push(table: SyncTable, rows: ServerRow[]): Promise<PushResult>;
  /** Rows with (updated_at, key) > `after`, ascending. Throws on network failure. */
  pull(table: SyncTable, after: Cursor | null, limit: number): Promise<ServerRow[]>;
  /** The user's live document with these bytes (FR-SYN-09), or null. Throws on network failure. */
  findLiveDocument(contentHash: string): Promise<ServerRow | null>;
}

/** Postgres unique_violation: for documents, the live (user_id, content_hash) index (FR-SYN-09). */
export const UNIQUE_VIOLATION = '23505';

/** 401 = session, 408/429/5xx/network = transient; 409 is a conflict handled by the caller (FR-SYN-09). */
export const isRetryable = (status: number) =>
  status === 0 || status === 401 || status === 408 || status === 409 || status === 429 || status >= 500;

export type PushOutcome = 'done' | 'retry' | 'auth';

const cursorKey = (t: SyncTable) => `sync.cursor.${t}`;
const time = (iso: string) => Date.parse(iso);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function createSyncEngine(transport: SyncTransport, userId: string, db: AppDB = appDb) {
  async function pending(entity: OutboxEntity): Promise<OutboxItem[]> {
    const items = await db.outbox.where('[entity+entityId]').between([entity, ''], [entity, '￿']).toArray();
    return items.filter((i) => i.status === 'pending').sort((a, b) => a.seq! - b.seq!);
  }

  /** Remove sent items (only those seqs: an edit during the push left a newer item) and take server timestamps. */
  async function acknowledge(entity: OutboxEntity, sent: OutboxItem[], rows: ServerRow[]): Promise<void> {
    const key = KEY_OF[TABLE_OF[entity]];
    await db.transaction('rw', [db.outbox, db.documents, db.annotations, db.positions, db.meta], async () => {
      await db.outbox.bulkDelete(sent.map((i) => i.seq!));
      for (const r of rows) {
        const id = str(r[key]);
        const at = typeof r.updated_at === 'string' ? new Date(r.updated_at).toISOString() : null;
        if (
          !at ||
          (await db.outbox
            .where('[entity+entityId]')
            .equals([entity, entity === 'settings' ? 'profile' : id])
            .count())
        )
          continue;
        if (entity === 'document') await db.documents.update(id, { updatedAt: at });
        else if (entity === 'annotation') await db.annotations.update(id, { updatedAt: at });
        else if (entity === 'position') await db.positions.update(id, { updatedAt: at });
        else {
          const cur = (await db.meta.get('settings'))?.value as StoredSettings | undefined;
          if (cur) await db.meta.put({ key: 'settings', value: { ...cur, updatedAt: at } });
        }
      }
    });
  }

  async function fail(items: OutboxItem[], message: string, permanent: boolean): Promise<void> {
    await db.transaction('rw', db.outbox, async () => {
      for (const i of items) {
        const cur = await db.outbox.get(i.seq!);
        if (cur)
          await db.outbox.put({
            ...cur,
            attempts: cur.attempts + 1,
            lastError: message,
            status: permanent ? 'failed' : 'pending',
          });
      }
    });
  }

  async function push(): Promise<PushOutcome> {
    for (const entity of PUSH_ORDER) {
      const table = TABLE_OF[entity];
      const items = await pending(entity);
      for (let i = 0; i < items.length; i += PUSH_BATCH_SIZE) {
        const batch = items.slice(i, i + PUSH_BATCH_SIZE);
        const res = await transport.push(
          table,
          batch.map((it) => toServer(entity, it.payload, userId)),
        );
        if (res.ok) {
          await acknowledge(entity, batch, res.rows);
          continue;
        }
        const duplicate = entity === 'document' && res.code === UNIQUE_VIOLATION;
        if (isRetryable(res.status) && !duplicate) {
          await fail(batch, res.message, false);
          return res.status === 401 ? 'auth' : 'retry';
        }
        // permanent error or a duplicate document: one row fails the whole statement, so go row by row
        for (const it of batch) {
          const one = batch.length === 1 ? res : await transport.push(table, [toServer(entity, it.payload, userId)]);
          if (one.ok) await acknowledge(entity, [it], one.rows);
          else if (entity === 'document' && one.code === UNIQUE_VIOLATION) {
            if (!(await adopt(it))) {
              await fail([it], one.message, false);
              return 'retry';
            }
          } else if (isRetryable(one.status)) {
            await fail([it], one.message, false);
            return one.status === 401 ? 'auth' : 'retry';
          } else await fail([it], one.message, true);
        }
      }
    }
    return 'done';
  }

  /**
   * FR-SYN-09: another device already added these bytes. Adopt its document id: move annotations, the reading
   * position, outbox payloads and the cached file/cover to it, drop the local duplicate, all in one transaction.
   * Children then push under the adopted id later in the same run (PUSH_ORDER).
   */
  async function adopt(item: OutboxItem): Promise<boolean> {
    const local = item.payload as { id: string; contentHash: string };
    const remote = await transport.findLiveDocument(local.contentHash);
    const parsed = remote && fromServer('documents', remote);
    if (parsed?.table !== 'documents') return false; // gone or unreadable meanwhile: retry later
    const from = local.id;
    const to = parsed.row.id;
    await db.transaction(
      'rw',
      [db.documents, db.annotations, db.positions, db.outbox, db.files, db.covers],
      async () => {
        await db.annotations.where('documentId').equals(from).modify({ documentId: to });
        const pos = await db.positions.get(from);
        if (pos) {
          await db.positions.delete(from);
          if (!(await db.positions.get(to))) await db.positions.put({ ...pos, documentId: to });
        }
        for (const o of await db.outbox.toArray()) {
          if (o.entity === 'document' && o.entityId === from) await db.outbox.delete(o.seq!);
          else if ((o.payload as { documentId?: string } | null)?.documentId === from)
            await db.outbox.put({
              ...o,
              entityId: o.entity === 'position' ? to : o.entityId,
              payload: { ...(o.payload as object), documentId: to },
            });
        }
        const file = await db.files.get(from);
        if (file) {
          await db.files.delete(from);
          if (!(await db.files.get(to))) await db.files.put({ ...file, documentId: to });
        }
        const cover = await db.covers.get(from);
        if (cover) {
          await db.covers.delete(from);
          if (!(await db.covers.get(to))) await db.covers.put({ ...cover, documentId: to });
        }
        await db.documents.delete(from);
        await db.documents.put(parsed.row);
      },
    );
    return true;
  }

  async function hasPending(entity: OutboxEntity, id: string): Promise<boolean> {
    return (await db.outbox.where('[entity+entityId]').equals([entity, id]).count()) > 0;
  }

  /** Apply one pulled row: skip if a local edit is waiting; otherwise last-write-wins by server updated_at. */
  async function apply(table: SyncTable, row: ServerRow): Promise<void> {
    const p = fromServer(table, row);
    if (!p) return; // invalid for this client version: ignored, never written
    await db.transaction('rw', [db.outbox, db.documents, db.annotations, db.positions, db.meta], async () => {
      switch (p.table) {
        case 'documents': {
          if (await hasPending('document', p.row.id)) return;
          const cur = await db.documents.get(p.row.id);
          if (!cur || time(p.row.updatedAt) >= time(cur.updatedAt)) await db.documents.put(p.row);
          return;
        }
        case 'annotations': {
          if (await hasPending('annotation', p.row.id)) return;
          const cur = await db.annotations.get(p.row.id);
          if (!cur || time(p.row.updatedAt) >= time(cur.updatedAt)) await db.annotations.put(p.row);
          return;
        }
        case 'reading_positions': {
          if (await hasPending('position', p.row.documentId)) return;
          const cur = await db.positions.get(p.row.documentId);
          if (!cur || time(p.row.updatedAt) >= time(cur.updatedAt)) await db.positions.put(p.row);
          return;
        }
        case 'profiles': {
          if (await hasPending('settings', 'profile')) return;
          const cur = (await db.meta.get('settings'))?.value as StoredSettings | undefined;
          if (!cur || time(p.updatedAt) >= time(cur.updatedAt)) {
            const value: StoredSettings = { settings: p.settings, updatedAt: p.updatedAt, localUpdatedAt: Date.now() };
            await db.meta.put({ key: 'settings', value });
          }
        }
      }
    });
  }

  async function pull(): Promise<void> {
    for (const table of TABLES) {
      const saved = (await db.meta.get(cursorKey(table)))?.value as Cursor | undefined;
      // the overlap catches rows whose transactions committed out of timestamp order; applying is idempotent
      let after: Cursor | null = saved
        ? { ts: new Date(time(saved.ts) - PULL_OVERLAP_MS).toISOString(), key: '' }
        : null;
      for (;;) {
        const rows = await transport.pull(table, after, PULL_PAGE);
        for (const r of rows) await apply(table, r);
        const last = rows.at(-1);
        if (last) {
          after = { ts: str(last.updated_at), key: str(last[KEY_OF[table]]) };
          if (!saved || time(after.ts) >= time(saved.ts)) await db.meta.put({ key: cursorKey(table), value: after });
        }
        if (rows.length < PULL_PAGE) break;
      }
    }
  }

  return { push, pull, apply };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
