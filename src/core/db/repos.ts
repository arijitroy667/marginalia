/**
 * Repositories: the only write path for UI code (CLAUDE.md rule 3). Each mutation writes the row AND
 * its outbox snapshot in one Dexie transaction before resolving (FR-SYN-02), so nothing confirmed to the
 * user can be lost by a tab kill. Outbox entries coalesce per entity at write time: a newer full
 * snapshot replaces older ones for the same (entity, entityId), which is lossless.
 */
import {
  AnnotationRowSchema,
  DEFAULT_SETTINGS,
  DocumentRowSchema,
  PositionRowSchema,
  SettingsSchema,
  type AnnotationRow,
  type DocumentRow,
  type PositionRow,
  type Settings,
} from './models';
import { db, type OutboxEntity, type OutboxOp } from './schema';

const now = () => new Date().toISOString();

/** Must run inside the caller's transaction. */
async function enqueue(entity: OutboxEntity, entityId: string, op: OutboxOp, payload: unknown): Promise<void> {
  await db.outbox.where('[entity+entityId]').equals([entity, entityId]).delete();
  await db.outbox.add({ entity, entityId, op, payload, attempts: 0, status: 'pending', createdAt: Date.now() });
}

type Server = 'createdAt' | 'updatedAt' | 'deletedAt' | 'localUpdatedAt';
export type NewDocument = Omit<DocumentRow, Server | 'lastOpenedAt'> & Partial<Pick<DocumentRow, 'lastOpenedAt'>>;

export const documentsRepo = {
  async create(input: NewDocument): Promise<DocumentRow> {
    const t = now();
    const row = DocumentRowSchema.parse({
      lastOpenedAt: null,
      ...input,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      localUpdatedAt: Date.now(),
    });
    await db.transaction('rw', db.documents, db.outbox, async () => {
      await db.documents.add(row);
      await enqueue('document', row.id, 'upsert', row);
    });
    return row;
  },

  async update(
    id: string,
    patch: Partial<Omit<DocumentRow, 'id' | 'createdAt'>>,
    op: OutboxOp = 'upsert',
  ): Promise<DocumentRow> {
    return db.transaction('rw', db.documents, db.outbox, async () => {
      const cur = await db.documents.get(id);
      if (!cur) throw new Error('document not found');
      const row = DocumentRowSchema.parse({ ...cur, ...patch, updatedAt: now(), localUpdatedAt: Date.now() });
      await db.documents.put(row);
      await enqueue('document', id, op, row);
      return row;
    });
  },

  softDelete(id: string): Promise<DocumentRow> {
    return documentsRepo.update(id, { deletedAt: now() }, 'delete');
  },

  /** Live (not tombstoned) document with these bytes, if already in the library (FR-LIB-02 dedupe). */
  async findByHash(contentHash: string): Promise<DocumentRow | undefined> {
    const rows = await db.documents.where('contentHash').equals(contentHash).toArray();
    return rows.find((d) => d.deletedAt === null);
  },
};

export type NewAnnotation = Omit<AnnotationRow, Server>;
type AnnotationPatch = Partial<Pick<AnnotationRow, 'colorId' | 'body' | 'label' | 'anchor' | 'page' | 'deletedAt'>>;

export const annotationsRepo = {
  async create(input: NewAnnotation): Promise<AnnotationRow> {
    const t = now();
    const row = AnnotationRowSchema.parse({
      ...input,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      localUpdatedAt: Date.now(),
    });
    await db.transaction('rw', db.annotations, db.outbox, async () => {
      await db.annotations.add(row);
      await enqueue('annotation', row.id, 'upsert', row);
    });
    return row;
  },

  async update(id: string, patch: AnnotationPatch, op: OutboxOp = 'upsert'): Promise<AnnotationRow> {
    return db.transaction('rw', db.annotations, db.outbox, async () => {
      const cur = await db.annotations.get(id);
      if (!cur) throw new Error('annotation not found');
      const row = AnnotationRowSchema.parse({ ...cur, ...patch, updatedAt: now(), localUpdatedAt: Date.now() });
      await db.annotations.put(row);
      await enqueue('annotation', id, op, row);
      return row;
    });
  },

  /** Tombstone (synced as deleted_at). */
  remove(id: string): Promise<AnnotationRow> {
    return annotationsRepo.update(id, { deletedAt: now() }, 'delete');
  },

  /** Undo of a delete restores the same id so devices converge (FR-KEY-06). */
  restore(id: string): Promise<AnnotationRow> {
    return annotationsRepo.update(id, { deletedAt: null });
  },

  /** Live annotations of a document (overlays, annotation panel). */
  async ofDocument(documentId: string): Promise<AnnotationRow[]> {
    const rows = await db.annotations.where('documentId').equals(documentId).toArray();
    return rows.filter((a) => a.deletedAt === null);
  },

  /** Live annotations of one kind in a document (`[` `]`). */
  async ofKind(documentId: string, kind: AnnotationRow['kind']): Promise<AnnotationRow[]> {
    const rows = await db.annotations.where('[documentId+kind]').equals([documentId, kind]).toArray();
    return rows.filter((a) => a.deletedAt === null);
  },

  /** Live (not tombstoned) annotations on one page. */
  async onPage(documentId: string, page: number): Promise<AnnotationRow[]> {
    const rows = await db.annotations.where('[documentId+page]').equals([documentId, page]).toArray();
    return rows.filter((a) => a.deletedAt === null);
  },
};

export const positionsRepo = {
  async save(input: Omit<PositionRow, 'updatedAt' | 'localUpdatedAt'>): Promise<PositionRow> {
    const row = PositionRowSchema.parse({ ...input, updatedAt: now(), localUpdatedAt: Date.now() });
    await db.transaction('rw', db.positions, db.outbox, async () => {
      await db.positions.put(row);
      await enqueue('position', row.documentId, 'upsert', row);
    });
    return row;
  },
};

export interface StoredSettings {
  settings: Settings;
  updatedAt: string;
  localUpdatedAt: number;
}
const SETTINGS_KEY = 'settings';

export const settingsRepo = {
  async get(): Promise<Settings> {
    const stored = (await db.meta.get(SETTINGS_KEY))?.value as StoredSettings | undefined;
    const parsed = SettingsSchema.safeParse(stored?.settings ?? {});
    return parsed.success ? parsed.data : DEFAULT_SETTINGS; // a bad stored value must never break the app
  },

  async update(patch: Partial<Settings>): Promise<Settings> {
    return db.transaction('rw', db.meta, db.outbox, async () => {
      const settings = SettingsSchema.parse({ ...(await settingsRepo.get()), ...patch });
      const value: StoredSettings = { settings, updatedAt: now(), localUpdatedAt: Date.now() };
      await db.meta.put({ key: SETTINGS_KEY, value });
      await enqueue('settings', 'profile', 'upsert', value);
      return settings;
    });
  },
};

/** Local PDF blob cache (FR-LIB-06/08). Blobs never ride the outbox; they use the transfer queue (M3). */
export const filesRepo = {
  async put(documentId: string, blob: Blob, pinned = false): Promise<void> {
    await db.files.put({ documentId, blob, size: blob.size, lastAccessAt: Date.now(), pinned });
  },
  async get(documentId: string): Promise<Blob | undefined> {
    const row = await db.files.get(documentId);
    if (row) await db.files.update(documentId, { lastAccessAt: Date.now() });
    return row?.blob;
  },
};

export const libraryRepo = {
  /**
   * Adds a document with its file and cover in one transaction. Re-checks the hash inside the transaction,
   * so two concurrent adds of the same bytes yield one document (FR-LIB-02).
   */
  async addDocument(
    input: NewDocument,
    file: Blob,
    cover: Blob | null,
  ): Promise<{ document: DocumentRow; existing: boolean }> {
    return db.transaction('rw', [db.documents, db.outbox, db.files, db.covers], async () => {
      const existing = await documentsRepo.findByHash(input.contentHash);
      if (existing) return { document: existing, existing: true };
      await filesRepo.put(input.id, file);
      if (cover) await db.covers.put({ documentId: input.id, blob: cover });
      return { document: await documentsRepo.create(input), existing: false };
    });
  },
};

/** Outbox items a push rejected permanently (FR-SYN-10, Sync issues screen). */
export const outboxRepo = {
  failed: () => db.outbox.where('status').equals('failed').sortBy('seq'),
  /** Back to pending, so the next sync tries again (e.g. after a server-side fix). */
  async retry(seq: number): Promise<void> {
    await db.outbox.update(seq, { status: 'pending', attempts: 0 });
  },
  async retryAll(): Promise<void> {
    await db.outbox.where('status').equals('failed').modify({ status: 'pending', attempts: 0 });
  },
  /** Give up on pushing this change; the local row stays as it is on this device. */
  async discard(seq: number): Promise<void> {
    await db.outbox.delete(seq);
  },
};

/** Device-local flags and ids (not synced). */
export const metaRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.meta.get(key))?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value });
  },
};

let deviceIdPromise: Promise<string> | undefined;
/** Random id persisted per browser profile (reading_positions.device_id). Memoised so racing callers share it. */
export function deviceId(): Promise<string> {
  deviceIdPromise ??= db.transaction('rw', db.meta, async () => {
    const existing = await metaRepo.get<string>('deviceId');
    if (existing) return existing;
    const id = crypto.randomUUID();
    await metaRepo.set('deviceId', id);
    return id;
  });
  return deviceIdPromise;
}

/** Device-local Line Engine cache (PRD §8.5); keyed by engine version, so engine changes never read stale lines. */
export const lineCacheRepo = {
  async get(docHash: string, page: number, engine: number): Promise<unknown> {
    return (await db.lineCache.get([docHash, page, engine]))?.data;
  },
  async put(docHash: string, page: number, engine: number, data: unknown): Promise<void> {
    await db.lineCache.put({ docHash, page, engine, data });
  },
};
