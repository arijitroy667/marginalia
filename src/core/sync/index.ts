/**
 * The running sync for the signed-in user (one at a time). The auth layer starts it after sign-in and stops it on
 * sign-out (T-103); in local-only mode it never starts and the UI shows no sync status (ADR 0007).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseConfig } from '../supabase/client';
import { createBlobSync, downloadFile, type DownloadProgress } from './blobs';
import { createSyncEngine } from './engine';
import { createScheduler, type Scheduler, type SyncStatus } from './scheduler';
import { supabaseTransport } from './supabaseTransport';

let current: Scheduler | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
const emit = () => listeners.forEach((l) => l());

export function startSync(sb: SupabaseClient, userId: string, onAuthError?: () => void): void {
  stopSync();
  const engine = createSyncEngine(supabaseTransport(sb), userId);
  const cfg = supabaseConfig();
  const blobs = cfg && createBlobSync(sb, userId, cfg.url, cfg.anonKey);
  // files first: an upload records storagePath, which then goes out in the same push (FR-SYN-07)
  const withFiles = { ...engine, push: async () => (await blobs?.uploadPending(), engine.push()) };
  current = createScheduler(withFiles, onAuthError ? { onAuthError } : {});
  unsubscribe = current.subscribe(emit);
  current.start();
  emit();
}

export function stopSync(): void {
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
