/**
 * The Supabase client, or null in local-only mode (no project configured, ADR 0007). Only `core/{sync,auth,supabase}`
 * may import this (CLAUDE.md rule 2). The anon/publishable key is public by design; RLS guards every row (NFR-SEC-01).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const Env = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const env = Env.safeParse(import.meta.env);
    client = env.success
      ? createClient(env.data.VITE_SUPABASE_URL, env.data.VITE_SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      : null;
  }
  return client;
}

export const isCloudConfigured = (): boolean => supabase() !== null;
