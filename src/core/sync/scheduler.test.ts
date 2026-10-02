import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDB } from '../db/schema';
import type { PushOutcome, SyncEngine } from './engine';
import { backoff, BACKOFF_MAX_MS, createScheduler } from './scheduler';

describe('backoff (FR-SYN-03)', () => {
  it('doubles from 1 s, caps at 60 s, jitter ±50 %', () => {
    expect(backoff(0, () => 0.5)).toBe(1000);
    expect(backoff(3, () => 0.5)).toBe(8000);
    expect(backoff(10, () => 0.5)).toBe(BACKOFF_MAX_MS);
    expect(backoff(10, () => 0.99)).toBe(BACKOFF_MAX_MS); // never above the cap
    expect(backoff(2, () => 0)).toBe(2000);
    expect(backoff(2, () => 0.999)).toBe(5996);
  });
});

describe('scheduler status (FR-SYN-05)', () => {
  let d: AppDB;
  beforeEach(async () => {
    d = new AppDB(`sched-${Math.random()}`);
    await d.open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); // IndexedDB fake keeps its own scheduling
  });
  afterEach(async () => {
    vi.useRealTimers();
    await d.delete();
  });
  const engine = (outcomes: (PushOutcome | Error)[]) => {
    const pull = vi.fn(() => Promise.resolve());
    const push = vi.fn(() => {
      const o = outcomes.shift() ?? 'done';
      return o instanceof Error ? Promise.reject(o) : Promise.resolve(o);
    });
    return { push, pull, apply: vi.fn() } as unknown as SyncEngine & { push: typeof push; pull: typeof pull };
  };
  const add = (status: 'pending' | 'failed') =>
    d.outbox.add({
      entity: 'document',
      entityId: crypto.randomUUID(),
      op: 'upsert',
      payload: {},
      attempts: 0,
      status,
      createdAt: 0,
    });

  it('offline: no request, pending count shown', async () => {
    await add('pending');
    const e = engine([]);
    const s = createScheduler(e, { db: d, online: () => false });
    await s.run();
    expect(e.push).not.toHaveBeenCalled();
    expect(s.getStatus()).toEqual({ state: 'offline', pending: 1, failed: 0 });
  });

  it('success pulls and reports synced; failed items report an error to fix', async () => {
    const e = engine(['done', 'done']);
    const s = createScheduler(e, { db: d, online: () => true });
    await s.run();
    expect(e.pull).toHaveBeenCalledTimes(1);
    expect(s.getStatus().state).toBe('synced');
    await add('failed');
    await s.run();
    expect(s.getStatus()).toEqual({ state: 'error', pending: 0, failed: 1 });
  });

  it('retryable failures back off and retry; a network error in pull too', async () => {
    const e = engine(['retry', new Error('network'), 'done']);
    const s = createScheduler(e, { db: d, online: () => true, random: () => 0.5 });
    await s.run();
    expect(s.getStatus().state).toBe('error');
    await vi.advanceTimersByTimeAsync(1000); // attempt 0: 1 s
    expect(e.push).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(e.push).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // attempt 1: 2 s
    expect(e.push).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 50 && s.getStatus().state === 'syncing'; i++) await new Promise((r) => setImmediate(r)); // IndexedDB counts
    expect(s.getStatus().state).toBe('synced');
  });

  it('401 asks for a sign-in and keeps the outbox', async () => {
    await add('pending');
    const onAuthError = vi.fn();
    const s = createScheduler(engine(['auth']), { db: d, online: () => true, onAuthError });
    await s.run();
    expect(onAuthError).toHaveBeenCalled();
    expect(s.getStatus()).toEqual({ state: 'signin', pending: 1, failed: 0 });
  });

  it('one run at a time: a trigger during a run queues exactly one more', async () => {
    let release!: () => void;
    const e = engine([]);
    e.push.mockImplementationOnce(() => new Promise<PushOutcome>((r) => (release = () => r('done'))));
    const s = createScheduler(e, { db: d, online: () => true });
    const first = s.run();
    await s.run();
    await s.run();
    release();
    await first;
    await vi.runOnlyPendingTimersAsync();
    expect(e.push).toHaveBeenCalledTimes(2);
  });
});
