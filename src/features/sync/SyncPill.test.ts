import { describe, expect, it } from 'vitest';
import { syncLabel } from './SyncPill';

describe('sync status labels (FR-SYN-05)', () => {
  it('names every state as in PRD §10.4', () => {
    expect(syncLabel({ state: 'synced', pending: 0, failed: 0 })).toBe('Synced');
    expect(syncLabel({ state: 'syncing', pending: 2, failed: 0 })).toBe('Syncing…');
    expect(syncLabel({ state: 'offline', pending: 3, failed: 0 })).toBe('Offline · 3 pending');
    expect(syncLabel({ state: 'offline', pending: 0, failed: 0 })).toBe('Offline');
    expect(syncLabel({ state: 'error', pending: 1, failed: 0 })).toBe('Sync error');
    expect(syncLabel({ state: 'error', pending: 0, failed: 2 })).toBe('2 changes need attention');
    expect(syncLabel({ state: 'signin', pending: 1, failed: 0 })).toBe('Sign in to sync');
  });
});
