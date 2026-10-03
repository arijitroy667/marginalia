import { useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { replaceLocalData, signOut } from '../../core/auth';
import { en } from '../../shared/i18n/en';
import { useAuth } from './useAuth';

/**
 * Route guard (T-103): with a Supabase project configured the app needs a session; local-only mode stays open
 * (ADR 0007). Another account's data on this device blocks the app until the user decides (ADR 0007).
 */
export function AuthGate() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  if (auth.status === 'local' || auth.status === 'signed-in') return <Outlet />;
  if (auth.status === 'loading') return <p className="p-6 text-muted">{en.auth.loading}</p>;
  if (auth.status === 'signed-out') return <Navigate to="/login" replace />;
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">{en.auth.foreignTitle}</h1>
      <p>{en.auth.foreignBody(auth.email)}</p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => run(replaceLocalData)}
          className="min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg"
        >
          {en.auth.removeAndContinue}
        </button>
        <button
          disabled={busy}
          onClick={() => run(() => signOut(false))}
          className="min-h-11 rounded-md border border-line-strong px-4"
        >
          {en.auth.signOut}
        </button>
      </div>
    </main>
  );
}
