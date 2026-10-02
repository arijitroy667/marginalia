/**
 * Two-user tenancy test against the configured Supabase project (NFR-SEC-01, S5, T-102).
 * Needs .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (test-only).
 * Creates two throwaway users, proves B can neither read nor write A's rows or files, checks constraints,
 * server-assigned updated_at and a > 6 MB resumable (TUS) upload, then deletes both users.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as tus from 'tus-js-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* no local env: suite is skipped below */
}
const URL_ = process.env.VITE_SUPABASE_URL ?? '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = Boolean(URL_ && ANON && SERVICE);

interface TestUser {
  id: string;
  db: SupabaseClient;
  token: string;
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe.skipIf(!enabled)('tenancy: RLS + storage + constraints (two users)', () => {
  const admin = enabled ? createClient(URL_, SERVICE, opts) : (null as unknown as SupabaseClient);
  let A: TestUser;
  let B: TestUser;
  const docA = randomUUID();
  const fileA = randomBytes(1024);
  const pathA = () => `${A.id}/${hash(fileA)}.pdf`;

  async function makeUser(tag: string): Promise<TestUser> {
    const email = `rls-${tag}-${randomUUID().slice(0, 8)}@marginalia.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const db = createClient(URL_, ANON, opts);
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { id: created.data.user.id, db, token: data.session.access_token };
  }

  beforeAll(async () => {
    A = await makeUser('a');
    B = await makeUser('b');
  }, 30_000);

  afterAll(async () => {
    if (A) await admin.storage.from('pdfs').remove([pathA(), `${A.id}/big.pdf`]);
    for (const u of [A, B]) if (u) await admin.auth.admin.deleteUser(u.id); // cascades all rows
  }, 30_000);

  it('auto-creates a profile per user, visible only to its owner', async () => {
    const own = await A.db.from('profiles').select('id').eq('id', A.id);
    expect(own.data).toHaveLength(1);
    const other = await B.db.from('profiles').select('id').eq('id', A.id);
    expect(other.data).toHaveLength(0);
  });

  it('A writes a document, annotation and position; updated_at is server-assigned', async () => {
    const doc = await A.db
      .from('documents')
      .insert({ id: docA, content_hash: hash(fileA), title: 'A book', page_count: 3, file_size: 1024, updated_at: '2000-01-01T00:00:00Z' })
      .select('updated_at')
      .single();
    expect(doc.error).toBeNull();
    expect(Date.now() - Date.parse(String(doc.data?.updated_at))).toBeLessThan(5 * 60_000);

    const anchor = { v: 1, page: 2, rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }], quote: { exact: 'q', prefix: '', suffix: '' } };
    const ann = await A.db.from('annotations').insert({ id: randomUUID(), document_id: docA, kind: 'highlight', page: 2, anchor, color_id: 1 });
    expect(ann.error).toBeNull();
    const pos = await A.db.from('reading_positions').upsert({ document_id: docA, page: 2, progress: 0.5, device_id: 'dev-a' });
    expect(pos.error).toBeNull();
  });

  it('B cannot read or modify any of A\'s rows', async () => {
    const patch = { documents: { title: 'hacked' }, annotations: { color_id: 2 }, reading_positions: { progress: 0.9 } };
    for (const table of ['documents', 'annotations', 'reading_positions'] as const) {
      const col = table === 'documents' ? 'id' : 'document_id';
      const read = await B.db.from(table).select('*').eq(col, docA);
      expect(read.data, table).toHaveLength(0);
      const upd = await B.db.from(table).update(patch[table]).eq(col, docA).select();
      expect(upd.error, table).toBeNull();
      expect(upd.data, table).toHaveLength(0);
    }
    const del = await B.db.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', docA).select();
    expect(del.data ?? []).toHaveLength(0);
    const still = await A.db.from('documents').select('deleted_at').eq('id', docA).single();
    expect(still.data!.deleted_at).toBeNull();
  });

  it('B cannot insert rows owned by A, nor attach rows to A\'s document', async () => {
    const asA = await B.db.from('documents').insert({ id: randomUUID(), user_id: A.id, content_hash: 'a'.repeat(64), title: 'x', page_count: 1, file_size: 1 });
    expect(asA.error?.code).toBe('42501'); // RLS with-check
    const anchor = { v: 1, page: 1, rects: [], quote: { exact: '', prefix: '', suffix: '' } };
    const attach = await B.db.from('annotations').insert({ id: randomUUID(), document_id: docA, kind: 'bookmark', page: 1, anchor });
    expect(attach.error?.code).toBe('23503'); // composite (document_id, user_id) FK
    const pos = await B.db.from('reading_positions').insert({ document_id: docA, page: 1, progress: 0, device_id: 'dev-b' });
    expect(pos.error?.code).toBe('23503');
  });

  it('enforces annotation constraints', async () => {
    const base = { document_id: docA, page: 1 };
    const anchor = (page: number) => ({ v: 1, page, rects: [], quote: { exact: '', prefix: '', suffix: '' } });
    const pageMismatch = await A.db.from('annotations').insert({ ...base, id: randomUUID(), kind: 'bookmark', anchor: anchor(2) });
    expect(pageMismatch.error?.code).toBe('23514');
    const noColor = await A.db.from('annotations').insert({ ...base, id: randomUUID(), kind: 'highlight', anchor: anchor(1) });
    expect(noColor.error?.code).toBe('23514');
    const noBody = await A.db.from('annotations').insert({ ...base, id: randomUUID(), kind: 'note', anchor: anchor(1) });
    expect(noBody.error?.code).toBe('23514');
    const badHash = await A.db.from('documents').insert({ id: randomUUID(), content_hash: 'nothex', title: 't', page_count: 1, file_size: 1 });
    expect(badHash.error?.code).toBe('23514');
  });

  it('storage: A owns its folder; B can neither read, list nor write it', async () => {
    const up = await A.db.storage.from('pdfs').upload(pathA(), fileA, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const read = await B.db.storage.from('pdfs').download(pathA());
    expect(read.error).not.toBeNull();
    const list = await B.db.storage.from('pdfs').list(A.id);
    expect(list.data ?? []).toHaveLength(0);
    const write = await B.db.storage.from('pdfs').upload(`${A.id}/evil.pdf`, fileA, { contentType: 'application/pdf' });
    expect(write.error).not.toBeNull();
    const cross = await A.db.storage.from('pdfs').upload(`${B.id}/x.pdf`, fileA, { contentType: 'application/pdf' });
    expect(cross.error).not.toBeNull();
    const own = await A.db.storage.from('pdfs').download(pathA());
    expect(own.error).toBeNull();
  });

  it('resumable (TUS) upload > 6 MB into A\'s folder; B is refused', async () => {
    // hosted: direct storage host (Supabase docs); local `supabase start`: the API gateway
    const host = new URL(URL_).hostname;
    const endpoint = host.endsWith('.supabase.co')
      ? `https://${host.split('.')[0]}.storage.supabase.co/storage/v1/upload/resumable`
      : `${URL_}/storage/v1/upload/resumable`;
    const data = randomBytes(7 * 1024 * 1024);
    const upload = (user: TestUser, objectName: string) =>
      new Promise<void>((resolve, reject) => {
        new tus.Upload(data, {
          endpoint,
          chunkSize: 6 * 1024 * 1024, // required by Supabase
          retryDelays: [0, 1000],
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: { authorization: `Bearer ${user.token}`, apikey: ANON, 'x-upsert': 'true' },
          metadata: { bucketName: 'pdfs', objectName, contentType: 'application/pdf', cacheControl: '3600' },
          onError: reject,
          onSuccess: () => resolve(),
        }).start();
      });
    await upload(A, `${A.id}/big.pdf`);
    const listed = await A.db.storage.from('pdfs').list(A.id, { search: 'big.pdf' });
    expect(listed.data?.[0]?.metadata?.size).toBe(data.length);
    await expect(upload(B, `${A.id}/big2.pdf`)).rejects.toBeTruthy();
  }, 120_000);
});
