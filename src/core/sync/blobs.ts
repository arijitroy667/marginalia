/**
 * PDF file transfer (FR-SYN-07, FR-LIB-05/06, PRD §8.8). Objects live at `pdfs/{user_id}/{content_hash}.pdf`, so the
 * same bytes from two devices are one object and the storage policy's first path segment is the owner. Uploads:
 * TUS (resumable, 6 MB chunks) above 6 MB, a plain upload below. Downloads: signed URL + streamed fetch with
 * progress, resumed with a Range request after a dropped connection, and never trusted: the SHA-256 must equal
 * `content_hash` before the file is cached.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Blob } from '../../shared/utils/hash';
import { documentsRepo, filesRepo } from '../db/repos';
import { db } from '../db/schema';

const BUCKET = 'pdfs';
const TUS_ABOVE = 6 * 1024 * 1024;
const TUS_CHUNK = 6 * 1024 * 1024; // Supabase requires exactly 6 MB
const DOWNLOAD_RETRIES = 3;

export const objectName = (userId: string, contentHash: string) => `${userId}/${contentHash}.pdf`;

/** Direct storage host for TUS on hosted projects (Supabase docs), the API gateway otherwise (local stack). */
function tusEndpoint(url: string): string {
  const host = new URL(url).hostname;
  return host.endsWith('.supabase.co')
    ? `https://${host.split('.')[0]}.storage.supabase.co/storage/v1/upload/resumable`
    : `${url}/storage/v1/upload/resumable`;
}

export function createBlobSync(sb: SupabaseClient, userId: string, supabaseUrl: string, anonKey: string) {
  async function exists(name: string): Promise<boolean> {
    const [folder, file] = name.split('/') as [string, string];
    const { data } = await sb.storage.from(BUCKET).list(folder, { search: file, limit: 1 });
    return !!data?.some((o) => o.name === file);
  }

  async function upload(name: string, blob: Blob): Promise<void> {
    if (blob.size <= TUS_ABOVE) {
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(name, blob, { contentType: 'application/pdf', upsert: true });
      if (error) throw new Error(error.message);
      return;
    }
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error('not signed in');
    const tus = await import('tus-js-client'); // only for large files: kept out of the app shell
    await new Promise<void>((resolve, reject) =>
      new tus.Upload(blob, {
        endpoint: tusEndpoint(supabaseUrl),
        chunkSize: TUS_CHUNK,
        retryDelays: [0, 1000, 3000, 5000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true, // fingerprints in localStorage let an interrupted upload resume
        headers: { authorization: `Bearer ${token}`, apikey: anonKey, 'x-upsert': 'true' },
        metadata: { bucketName: BUCKET, objectName: name, contentType: 'application/pdf', cacheControl: '3600' },
        onError: reject,
        onSuccess: () => resolve(),
      }).start(),
    );
  }

  /**
   * Upload every cloud-mode document whose file is on this device but not in the bucket yet, then record its
   * storagePath (which syncs the row). Failures are left for the next run; returns how many went up.
   */
  async function uploadPending(): Promise<number> {
    const docs = (await db.documents.toArray()).filter(
      (d) => d.storageMode === 'cloud' && !d.storagePath && !d.deletedAt,
    );
    let done = 0;
    for (const d of docs) {
      const blob = await filesRepo.get(d.id);
      if (!blob) continue;
      const name = objectName(userId, d.contentHash);
      try {
        if (!(await exists(name))) await upload(name, blob); // another device may have uploaded the same bytes
        await documentsRepo.update(d.id, { storagePath: name });
        done++;
      } catch {
        /* network or quota: retried on the next sync run */
      }
    }
    return done;
  }

  return { uploadPending };
}

export type DownloadProgress = { received: number; total: number };

export class HashMismatch extends Error {
  override name = 'HashMismatch';
}

/**
 * Download a document's file (FR-LIB-06): streamed with progress, resumed from the received byte after a dropped
 * connection (Range), cancellable with `signal`; cached only if its SHA-256 matches. Evicts by the cache budget.
 */
export async function downloadFile(
  sb: SupabaseClient,
  doc: { id: string; contentHash: string; storagePath: string; fileSize: number },
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.storagePath, 600);
  if (error || !data) throw new Error(error?.message ?? 'no signed URL');
  const parts: Uint8Array[] = [];
  let received = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(data.signedUrl, { signal, headers: received ? { range: `bytes=${received}-` } : {} });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      if (received && res.status !== 206) {
        parts.length = 0; // server ignored the range: start over
        received = 0;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        received += value.byteLength;
        onProgress({ received, total: doc.fileSize });
      }
      break;
    } catch (e) {
      if (signal.aborted || attempt >= DOWNLOAD_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  const blob = new Blob(parts as BlobPart[], { type: 'application/pdf' });
  if ((await sha256Blob(blob)) !== doc.contentHash) throw new HashMismatch('downloaded file does not match');
  await filesRepo.put(doc.id, blob);
  await filesRepo.evict(doc.id);
  return blob;
}

/** "Attach file" (FR-LIB-05): accept a local file for a document only if it has exactly the same bytes. */
export async function attachFile(doc: { id: string; contentHash: string }, file: Blob): Promise<boolean> {
  if ((await sha256Blob(file)) !== doc.contentHash) return false;
  await filesRepo.put(doc.id, file);
  await filesRepo.evict(doc.id);
  return true;
}
