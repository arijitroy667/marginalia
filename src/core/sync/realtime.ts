/**
 * Realtime (FR-SYN-06, P1): annotation and reading-position changes from the user's other devices, typically within
 * a second. Events go through the engine's `apply` (Zod-validated, pending local edits never overwritten, LWW by
 * server time), exactly like a pull. Deletes are tombstones, i.e. updates. Every (re)subscription triggers a full
 * sync run, so events missed while disconnected still arrive.
 */
import type { SupabaseClient } from '@supabase/supabase-js'; // type only: supabase-js stays out of the app shell
import type { ServerRow, SyncTable } from './mapping';

const TABLES: SyncTable[] = ['annotations', 'reading_positions'];

export function subscribeRealtime(
  sb: SupabaseClient,
  userId: string,
  apply: (table: SyncTable, row: ServerRow) => Promise<void>,
  onConnected: () => void,
): () => void {
  let channel = sb.channel(`sync:${userId}`);
  for (const table of TABLES)
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType !== 'DELETE') void apply(table, payload.new);
      },
    );
  channel.subscribe((status) => String(status) === 'SUBSCRIBED' && onConnected());
  return () => void sb.removeChannel(channel);
}
