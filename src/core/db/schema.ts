import Dexie, { type Table } from 'dexie';
import type { AnnotationRow, DocumentRow, PositionRow } from './models';

export type OutboxEntity = 'document' | 'annotation' | 'position' | 'settings';
export type OutboxOp = 'upsert' | 'delete'; // 'delete' = tombstone (an upsert carrying deletedAt)

/** Local mutation waiting to be pushed (PRD §8.8). `payload` is the full row snapshot. */
export interface OutboxItem {
  seq?: number;
  entity: OutboxEntity;
  entityId: string;
  op: OutboxOp;
  payload: unknown;
  attempts: number;
  status: 'pending' | 'failed';
  lastError?: string;
  createdAt: number;
}

export interface FileCacheRow {
  documentId: string;
  blob: Blob;
  size: number;
  lastAccessAt: number;
  pinned: boolean;
}
export interface CoverRow {
  documentId: string;
  blob: Blob;
}
export interface MetaRow {
  key: string;
  value: unknown;
}
export interface LineCacheRow {
  docHash: string;
  page: number;
  engine: number;
  data: unknown;
}

export class AppDB extends Dexie {
  documents!: Table<DocumentRow, string>;
  annotations!: Table<AnnotationRow, string>;
  positions!: Table<PositionRow, string>;
  files!: Table<FileCacheRow, string>;
  covers!: Table<CoverRow, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaRow, string>;
  lineCache!: Table<LineCacheRow, [string, number, number]>;

  constructor(name = 'marginalia') {
    super(name);
    // Every schema change = a new version(n) with an upgrade() and a test (NFR-REL-02).
    this.version(1).stores({
      documents: 'id, contentHash, lastOpenedAt, updatedAt, deletedAt',
      annotations: 'id, documentId, [documentId+page], [documentId+kind], updatedAt, deletedAt',
      positions: 'documentId, updatedAt',
      files: 'documentId, lastAccessAt',
      covers: 'documentId',
      outbox: '++seq, [entity+entityId], status',
      meta: 'key',
      lineCache: '[docHash+page+engine]',
    });
  }
}

export const db = new AppDB();
