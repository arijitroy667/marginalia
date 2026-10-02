/**
 * PostgREST transport for the sync engine (PRD §8.8). Upserts return the stored key + server `updated_at`; pulls
 * page by keyset `(updated_at, key) > cursor`, ascending. RLS scopes everything to the signed-in user.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cursor, PushResult, SyncTransport } from './engine';
import { KEY_OF, type ServerRow, type SyncTable } from './mapping';

/** PostgREST filter literal: quoted, so timestamps with `+`, `:` and `.` survive. */
const lit = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

export function supabaseTransport(sb: SupabaseClient): SyncTransport {
  return {
    async push(table: SyncTable, rows: ServerRow[]): Promise<PushResult> {
      const key = KEY_OF[table];
      const { data, error, status } = await sb
        .from(table)
        .upsert(rows, { onConflict: table === 'reading_positions' ? 'user_id,document_id' : 'id' })
        .select(`${key},updated_at`);
      if (error) return { ok: false, status, code: error.code, message: error.message };
      return { ok: true, rows: (data ?? []) as unknown as ServerRow[] }; // untyped client: no generated types yet (T-102)
    },

    async pull(table: SyncTable, after: Cursor | null, limit: number): Promise<ServerRow[]> {
      const key = KEY_OF[table];
      let q = sb
        .from(table)
        .select('*')
        .order('updated_at', { ascending: true })
        .order(key, { ascending: true })
        .limit(limit);
      if (after)
        q = after.key
          ? q.or(`updated_at.gt.${lit(after.ts)},and(updated_at.eq.${lit(after.ts)},${key}.gt.${lit(after.key)})`)
          : q.gte('updated_at', after.ts); // overlap start: every row from that instant on
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ServerRow[];
    },

    async findLiveDocument(contentHash: string): Promise<ServerRow | null> {
      const { data, error } = await sb
        .from('documents')
        .select('*')
        .eq('content_hash', contentHash)
        .is('deleted_at', null)
        .maybeSingle<ServerRow>();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}
