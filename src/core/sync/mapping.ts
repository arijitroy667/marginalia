/**
 * Local rows (camelCase, no user_id) <-> server rows (PRD §9.1, snake_case). Pulled rows are Zod-validated
 * before they touch Dexie (rule 8); pushed rows never carry user_id or updated_at (column default auth.uid()
 * and the set_updated_at trigger own them, ADR 0005/0007).
 */
import { z } from 'zod';
import {
  AnnotationRowSchema,
  DocumentRowSchema,
  PositionRowSchema,
  SettingsSchema,
  type AnnotationRow,
  type DocumentRow,
  type PositionRow,
  type Settings,
} from '../db/models';
import type { OutboxEntity } from '../db/schema';

export type SyncTable = 'documents' | 'annotations' | 'reading_positions' | 'profiles';
export type ServerRow = Record<string, unknown>;

export const TABLE_OF: Record<OutboxEntity, SyncTable> = {
  document: 'documents',
  annotation: 'annotations',
  position: 'reading_positions',
  settings: 'profiles',
};

/** Keyset tiebreaker per table (the PK besides updated_at): positions are keyed by document. */
export const KEY_OF: Record<SyncTable, string> = {
  documents: 'id',
  annotations: 'id',
  reading_positions: 'document_id',
  profiles: 'id',
};

/** Push order: FK parents before children, whatever the outbox seq (a re-saved document gets a newer seq). */
export const PUSH_ORDER: OutboxEntity[] = ['document', 'annotation', 'position', 'settings'];

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function pick(row: Record<string, unknown>, keys: string[]): ServerRow {
  const out: ServerRow = {};
  for (const k of keys) if (k in row) out[snake(k)] = row[k];
  return out;
}

const DOC_KEYS = [
  'id',
  'contentHash',
  'title',
  'author',
  'pageCount',
  'fileSize',
  'storageMode',
  'storagePath',
  'coverPath',
  'lastOpenedAt',
  'createdAt',
  'deletedAt',
];
const ANN_KEYS = ['id', 'documentId', 'kind', 'page', 'anchor', 'colorId', 'body', 'label', 'createdAt', 'deletedAt'];
const POS_KEYS = ['documentId', 'page', 'anchor', 'progress', 'deviceId', 'deviceLabel'];

/** Outbox payload -> server row. `userId` is needed only for profiles (its primary key). */
export function toServer(entity: OutboxEntity, payload: unknown, userId: string): ServerRow {
  const row = (payload ?? {}) as Record<string, unknown>;
  switch (entity) {
    case 'document':
      return pick(row, DOC_KEYS);
    case 'annotation':
      return pick(row, ANN_KEYS);
    case 'position':
      return pick(row, POS_KEYS);
    case 'settings':
      return { id: userId, settings: (row as { settings?: unknown }).settings ?? {} };
  }
}

const fromSnake = (row: ServerRow) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => k !== 'user_id')
      .map(([k, v]) => [camel(k), v]),
  );
// Postgres timestamptz -> ISO with offset; Zod's datetime wants at most a few fraction digits, so normalise to ms
const iso = (v: unknown) => (typeof v === 'string' ? new Date(v).toISOString() : v);
const withIsoTimes = (r: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (r[k] != null) r[k] = iso(r[k]);
  return r;
};

export type Pulled =
  | { table: 'documents'; row: DocumentRow }
  | { table: 'annotations'; row: AnnotationRow }
  | { table: 'reading_positions'; row: PositionRow }
  | { table: 'profiles'; settings: Settings; updatedAt: string };

/** Server row -> validated local row, or null when it does not pass the local schema (logged by the caller). */
export function fromServer(table: SyncTable, row: ServerRow, now = Date.now()): Pulled | null {
  const r = fromSnake(row);
  switch (table) {
    case 'documents': {
      const p = DocumentRowSchema.safeParse({
        ...withIsoTimes(r, ['lastOpenedAt', 'createdAt', 'updatedAt', 'deletedAt']),
        localUpdatedAt: now,
      });
      return p.success ? { table, row: p.data } : null;
    }
    case 'annotations': {
      const p = AnnotationRowSchema.safeParse({
        ...withIsoTimes(r, ['createdAt', 'updatedAt', 'deletedAt']),
        localUpdatedAt: now,
      });
      return p.success ? { table, row: p.data } : null;
    }
    case 'reading_positions': {
      const p = PositionRowSchema.safeParse({ ...withIsoTimes(r, ['updatedAt']), localUpdatedAt: now });
      return p.success ? { table, row: p.data } : null;
    }
    case 'profiles': {
      const s = SettingsSchema.safeParse(r.settings ?? {});
      const t = z.iso.datetime({ offset: true }).safeParse(iso(r.updatedAt));
      return s.success && t.success ? { table, settings: s.data, updatedAt: t.data } : null;
    }
  }
}
