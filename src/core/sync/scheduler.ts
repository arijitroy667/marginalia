/**
 * When to sync and what to tell the user (FR-SYN-03/05, PRD §8.8). Runs push then pull on start, `online`,
 * returning to the foreground (iOS has no Background Sync), 1 s after the last outbox write and every 30 s; retryable
 * failures back off 1 s -> 60 s with jitter. One run at a time; a trigger during a run queues one more.
 */
import { liveQuery } from 'dexie';
import { db as appDb, type AppDB } from '../db/schema';
import type { SyncEngine } from './engine';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'signin';
export interface SyncStatus {
  state: SyncState;
  pending: number;
  failed: number;
}

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
export const SYNC_INTERVAL_MS = 30_000;
export const AFTER_WRITE_MS = 1_000; // debounced: a burst of edits still goes up as one run (owner decision 2026-10-03)

/** Delay before retry `attempt` (0-based): doubling from 1 s, capped at 60 s, ±50 % jitter. */
export function backoff(attempt: number, random = Math.random): number {
  return Math.min(
    BACKOFF_MAX_MS,
    Math.round(Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt) * (0.5 + random())),
  );
}

interface Options {
  db?: AppDB;
  online?: () => boolean;
  /** 401: the session needs refreshing or a new sign-in; the outbox is kept. */
  onAuthError?: () => void;
  random?: () => number;
}

export function createScheduler(
  engine: SyncEngine,
  { db = appDb, online = () => navigator.onLine, onAuthError, random }: Options = {},
) {
  let status: SyncStatus = { state: 'syncing', pending: 0, failed: 0 };
  const listeners = new Set<() => void>();
  let running = false;
  let again = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let afterWrite: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const emit = (next: SyncStatus) => {
    status = next;
    listeners.forEach((l) => l());
  };
  const counts = async () => ({
    pending: await db.outbox.where('status').equals('pending').count(),
    failed: await db.outbox.where('status').equals('failed').count(),
  });

  async function run(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    clearTimeout(retry);
    if (!online()) return emit({ state: 'offline', ...(await counts()) });
    running = true;
    emit({ ...status, state: 'syncing' });
    try {
      const outcome = await engine.push();
      if (outcome === 'retry') throw new Error('push will be retried');
      if (outcome === 'auth') {
        onAuthError?.();
        emit({ state: 'signin', ...(await counts()) });
      } else {
        await engine.pull();
        attempt = 0;
        const c = await counts();
        emit({ state: c.failed ? 'error' : 'synced', ...c });
      }
    } catch {
      emit({ state: online() ? 'error' : 'offline', ...(await counts()) });
      retry = setTimeout(() => void run(), backoff(attempt++, random));
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  }

  const onVisible = () => document.visibilityState === 'visible' && void run();
  const onOnline = () => void run();

  return {
    run,
    start() {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      interval = setInterval(() => void run(), SYNC_INTERVAL_MS);
      let first = true;
      const sub = liveQuery(() => db.outbox.where('status').equals('pending').count()).subscribe((pending) => {
        // a new local change means "not synced yet", even before the delayed push runs (FR-SYN-05)
        if (pending > 0 && status.state === 'synced') emit({ ...status, state: 'syncing', pending });
        if (first) return void (first = false);
        clearTimeout(afterWrite);
        afterWrite = setTimeout(() => void run(), AFTER_WRITE_MS);
      });
      unsubscribe = () => sub.unsubscribe();
      void run();
    },
    stop() {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
      clearTimeout(retry);
      clearTimeout(afterWrite);
      unsubscribe?.();
    },
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
