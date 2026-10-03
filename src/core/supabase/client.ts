/**
 * The Supabase client, or null in local-only mode (no project configured, ADR 0007). Only `core/{sync,auth,supabase}`
 * may import this (CLAUDE.md rule 2). The anon/publishable key is public by design; RLS guards every row (NFR-SEC-01).
 * supabase-js is loaded on first use, outside the app-shell bundle (NFR-PERF-08).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const Env = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});
const env = Env.safeParse(import.meta.env);

export const isCloudConfigured = (): boolean => env.success;

let client: Promise<SupabaseClient> | undefined;

export function supabase(): Promise<SupabaseClient | null> {
  if (!env.success) return Promise.resolve(null);
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env.data;
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }),
  );
  return client;
}
