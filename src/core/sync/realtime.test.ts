import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { subscribeRealtime } from './realtime';

type Handler = (payload: { eventType: string; new: Record<string, unknown> }) => void;

function fakeClient() {
  const handlers: { filter: { table: string; filter: string }; cb: Handler }[] = [];
  let onStatus: (s: string) => void = () => undefined;
  const channel = {
    on: (_: string, filter: { table: string; filter: string }, cb: Handler) => (handlers.push({ filter, cb }), channel),
    subscribe: (cb: (s: string) => void) => ((onStatus = cb), channel),
  };
  const removeChannel = vi.fn();
  const sb = { channel: () => channel, removeChannel } as unknown as SupabaseClient;
  return { sb, handlers, removeChannel, status: (s: string) => onStatus(s) };
}

describe('realtime (FR-SYN-06)', () => {
  it("listens to the user's annotations and positions, applies inserts/updates, ignores deletes", () => {
    const f = fakeClient();
    const apply = vi.fn(() => Promise.resolve());
    subscribeRealtime(f.sb, 'u1', apply, () => undefined);
    expect(f.handlers.map((h) => [h.filter.table, h.filter.filter])).toEqual([
      ['annotations', 'user_id=eq.u1'],
      ['reading_positions', 'user_id=eq.u1'],
    ]);
    f.handlers[0]!.cb({ eventType: 'UPDATE', new: { id: 'a' } });
    f.handlers[1]!.cb({ eventType: 'INSERT', new: { document_id: 'd' } });
    f.handlers[0]!.cb({ eventType: 'DELETE', new: {} });
    expect(apply.mock.calls).toEqual([
      ['annotations', { id: 'a' }],
      ['reading_positions', { document_id: 'd' }],
    ]);
  });

  it('every (re)connect triggers a sync run; cleanup removes the channel', () => {
    const f = fakeClient();
    const onConnected = vi.fn();
    const stop = subscribeRealtime(f.sb, 'u1', () => Promise.resolve(), onConnected);
    f.status('CHANNEL_ERROR');
    f.status('SUBSCRIBED');
    f.status('SUBSCRIBED');
    expect(onConnected).toHaveBeenCalledTimes(2);
    stop();
    expect(f.removeChannel).toHaveBeenCalled();
  });
});
