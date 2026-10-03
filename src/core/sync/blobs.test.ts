import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Blob } from '../../shared/utils/hash';
import { db } from '../db/schema';
import { attachFile, downloadFile, HashMismatch } from './blobs';

const bytes = new TextEncoder().encode('%PDF-1.7 ' + 'x'.repeat(5000));
const sb = {
  storage: {
    from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://s/obj' }, error: null }) }),
  },
} as unknown as SupabaseClient;

/** A response streaming `chunks`; with `failAfter` the stream errors after that many chunks (dropped connection). */
function response(chunks: Uint8Array[], status = 200, failAfter = Infinity): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= failAfter) return c.error(new TypeError('network'));
      if (i < chunks.length) c.enqueue(chunks[i++]!);
      else c.close();
    },
  });
  return new Response(body, { status });
}

let hash = '';
beforeEach(async () => {
  await db.delete();
  await db.open();
  hash = await sha256Blob(new Blob([bytes]));
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const doc = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  contentHash: hash,
  storagePath: 'u/h.pdf',
  fileSize: bytes.length,
});

describe('downloadFile (FR-LIB-06, FR-SYN-07)', () => {
  it('resumes after a dropped connection with a Range request, verifies the hash, caches the file', async () => {
    const half = Math.floor(bytes.length / 2);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([bytes.slice(0, half), bytes.slice(half)], 200, 1)) // drops after the first chunk
      .mockResolvedValueOnce(response([bytes.slice(half)], 206));
    vi.stubGlobal('fetch', fetchMock);
    const progress: number[] = [];
    const done = downloadFile(sb, doc(), (p) => progress.push(p.received), new AbortController().signal);
    await vi.runAllTimersAsync();
    const blob = await done;
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ headers: { range: `bytes=${half}-` } });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(progress.at(-1)).toBe(bytes.length);
    expect(await db.files.get(doc().id)).toBeDefined();
  });

  it('starts over when the server ignores the range', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([bytes.slice(0, 100), bytes.slice(100)], 200, 1))
      .mockResolvedValueOnce(response([bytes], 200)); // full body again
    vi.stubGlobal('fetch', fetchMock);
    const done = downloadFile(sb, doc(), () => undefined, new AbortController().signal);
    await vi.runAllTimersAsync();
    expect(new Uint8Array(await (await done).arrayBuffer())).toEqual(bytes);
  });

  it('never caches bytes whose hash does not match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([new TextEncoder().encode('%PDF tampered')])));
    await expect(downloadFile(sb, doc(), () => undefined, new AbortController().signal)).rejects.toBeInstanceOf(
      HashMismatch,
    );
    expect(await db.files.count()).toBe(0);
  });
});

describe('attachFile (FR-LIB-05)', () => {
  it('accepts only the same bytes', async () => {
    expect(await attachFile(doc(), new Blob(['%PDF other']))).toBe(false);
    expect(await db.files.count()).toBe(0);
    expect(await attachFile(doc(), new Blob([bytes]))).toBe(true);
    expect(await db.files.count()).toBe(1);
  });
});
