/**
 * The running sync for the signed-in user (one at a time). The auth layer starts it after sign-in and stops it on
 * sign-out (T-103); in local-only mode it never starts and the UI shows no sync status (ADR 0007).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseConfig } from '../supabase/client';
import { createBlobSync, downloadFile, type DownloadProgress } from './blobs';
import { createSyncEngine } from './engine';
import { subscribeRealtime } from './realtime';
import { createScheduler, type Scheduler, type SyncStatus } from './scheduler';
import { supabaseTransport } from './supabaseTransport';

let current: Scheduler | null = null;
let active = { on: false }; // per sync session: stopSync turns it off before the old session can write again
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
let unsubscribeRealtime: (() => void) | undefined;
const emit = () => listeners.forEach((l) => l());

export function startSync(sb: SupabaseClient, userId: string, onAuthError?: () => void): void {
  stopSync();
  const session = (active = { on: true });
  const engine = createSyncEngine(supabaseTransport(sb), userId, undefined, () => session.on);
  const cfg = supabaseConfig();
  const blobs = cfg && createBlobSync(sb, userId, cfg.url, cfg.anonKey);
  // files first: an upload records storagePath, which then goes out in the same push (FR-SYN-07)
  const withFiles = { ...engine, push: async () => (await blobs?.uploadPending(), engine.push()) };
  current = createScheduler(withFiles, onAuthError ? { onAuthError } : {});
  unsubscribe = current.subscribe(emit);
  current.start();
  const scheduler = current;
  unsubscribeRealtime = subscribeRealtime(sb, userId, engine.apply, () => void scheduler.run()); // FR-SYN-06
  emit();
}

export function stopSync(): void {
  active.on = false;
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
  unsubscribe?.();
  current?.stop();
  current = null;
  emit();
}

/** Ask for a sync now (Retry button, Sync issues screen). */
export const syncNow = (): void => void current?.run();

/** Status for the UI, or null when nothing syncs (local-only or signed out). */
export const syncStatus = (): SyncStatus | null => current?.getStatus() ?? null;

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export type { SyncStatus } from './scheduler';

/** Download a document's file from the user's bucket (FR-LIB-06); throws offline, on cancel or a hash mismatch. */
export async function downloadDocumentFile(
  doc: { id: string; contentHash: string; storagePath: string; fileSize: number },
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const sb = await supabase();
  if (!sb) throw new Error('not configured');
  return downloadFile(sb, doc, onProgress, signal);
}

export { attachFile, HashMismatch, type DownloadProgress } from './blobs';

/**
 * Remove a PDF from the user's bucket (FR-LIB-07). Best effort: offline or signed out it fails and the object
 * stays (ponytail: an orphan costs quota until a server-side sweep of objects without a live document).
 */
export async function removeCloudFile(storagePath: string): Promise<boolean> {
  const sb = await supabase();
  if (!sb) return false;
  const { error } = await sb.storage.from('pdfs').remove([storagePath]);
  return !error;
}
