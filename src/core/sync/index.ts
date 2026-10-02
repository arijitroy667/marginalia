/**
 * The running sync for the signed-in user (one at a time). The auth layer starts it after sign-in and stops it on
 * sign-out (T-103); in local-only mode it never starts and the UI shows no sync status (ADR 0007).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSyncEngine } from './engine';
import { createScheduler, type Scheduler, type SyncStatus } from './scheduler';
import { supabaseTransport } from './supabaseTransport';

let current: Scheduler | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
const emit = () => listeners.forEach((l) => l());

export function startSync(sb: SupabaseClient, userId: string, onAuthError?: () => void): void {
  stopSync();
  current = createScheduler(createSyncEngine(supabaseTransport(sb), userId), onAuthError ? { onAuthError } : {});
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
