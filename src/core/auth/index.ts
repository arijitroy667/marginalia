/**
 * Auth (FR-SYN-01, T-103): email magic link + Google OAuth, persistent session (supabase-js, localStorage), and the
 * device-owner rule of ADR 0007: local rows carry no user_id, so the local database belongs to one account.
 * Data made in local-only mode is adopted by the first account that signs in; another account's data blocks sync
 * until the user removes it or signs out. Sync starts only for the owner.
 */
import type { Session } from '@supabase/supabase-js';
import { localData, metaRepo } from '../db/repos';
import { isCloudConfigured, supabase } from '../supabase/client';
import { startSync, stopSync } from '../sync';

export type AuthState =
  | { status: 'local' } // no Supabase project configured: everything stays on this device
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'foreign-data'; email: string } // this device holds another account's data (ADR 0007)
  | { status: 'signed-in'; userId: string; email: string };

const OWNER = 'ownerUserId';
let state: AuthState = isCloudConfigured() ? { status: 'loading' } : { status: 'local' };
const listeners = new Set<() => void>();
const set = (next: AuthState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const authState = (): AuthState => state;
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** ADR 0007: adopt ownerless data, start sync for the owner, stop at foreign data. */
async function onSession(session: Session | null): Promise<void> {
  const sb = await supabase();
  if (!sb) return;
  if (!session) {
    stopSync();
    return set({ status: 'signed-out' });
  }
  const { id, email = '' } = session.user;
  const owner = await metaRepo.get<string>(OWNER);
  if (!owner) await metaRepo.set(OWNER, id);
  else if (owner !== id) {
    stopSync();
    return set({ status: 'foreign-data', email });
  }
  if (state.status !== 'signed-in' || state.userId !== id) startSync(sb, id, () => void sb.auth.refreshSession());
  set({ status: 'signed-in', userId: id, email });
}

let started = false;
/** Restores the stored session and follows sign-in/out (incl. other tabs and token refreshes). Idempotent. */
export function initAuth(): void {
  if (!isCloudConfigured() || started) return;
  started = true;
  void supabase().then((sb) =>
    // the callback must not await Supabase calls (deadlock in supabase-js); hand off to a task
    sb?.auth.onAuthStateChange((_event, session) => void setTimeout(() => void onSession(session))),
  );
}

const redirect = () => `${window.location.origin}/`;

export async function signInWithEmail(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = await supabase();
  if (!sb) return { ok: false, message: 'not configured' };
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signInWithGoogle(): Promise<{ ok: false; message: string } | void> {
  const sb = await supabase();
  if (!sb) return { ok: false, message: 'not configured' };
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect() } });
  if (error) return { ok: false, message: error.message };
}

/** `/auth/confirm?token_hash=…&type=…`: the token-hash email-link flow (custom email templates, tests). */
export async function confirmEmailToken(tokenHash: string, type: 'magiclink' | 'email' | 'signup'): Promise<boolean> {
  const sb = await supabase();
  if (!sb) return false;
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  return !error;
}

/** Changes not yet accepted by the server (warn before removing them). */
export const unsyncedChanges = (): Promise<number> => localData.outboxCount();

/** Sign out; with `removeLocal` also delete every document, file and annotation on this device (FR-SYN-01). */
export async function signOut(removeLocal: boolean): Promise<void> {
  stopSync();
  await (await supabase())?.auth.signOut();
  if (removeLocal) await localData.wipe();
}

/** Foreign data screen: remove the other account's local data, then continue as the signed-in account. */
export async function replaceLocalData(): Promise<void> {
  const sb = await supabase();
  if (!sb) return;
  await localData.wipe();
  const { data } = await sb.auth.getSession();
  await onSession(data.session);
}
