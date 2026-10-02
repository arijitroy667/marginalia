import { useSyncExternalStore } from 'react';
import { subscribeSync, syncNow, syncStatus, type SyncStatus } from '../../core/sync';
import { en } from '../../shared/i18n/en';

/** Header pill text (FR-SYN-05, PRD §10.4): Synced · Syncing… · Offline · n pending · Sync error · Sign in to sync. */
export function syncLabel(s: SyncStatus): string {
  switch (s.state) {
    case 'synced':
      return en.sync.synced;
    case 'syncing':
      return en.sync.syncing;
    case 'offline':
      return en.sync.offline(s.pending);
    case 'error':
      return s.failed ? en.sync.issues(s.failed) : en.sync.error;
    case 'signin':
      return en.sync.signin;
  }
}

/** Nothing in local-only mode or when signed out; otherwise the status, with Retry on errors. */
export function SyncPill() {
  const status = useSyncExternalStore(subscribeSync, syncStatus);
  if (!status) return null;
  const tone =
    status.state === 'error' || status.state === 'signin' ? 'border-accent text-accent' : 'border-line text-muted';
  return (
    <span role="status" className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {syncLabel(status)}
      {status.state === 'error' && (
        <button className="min-h-8 rounded px-1 font-medium underline" onClick={syncNow}>
          {en.sync.retry}
        </button>
      )}
    </span>
  );
}
