import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { confirmEmailToken, signInWithEmail, signInWithGoogle } from '../../core/auth';
import { en } from '../../shared/i18n/en';
import { useAuth } from './useAuth';

/** Sign in (FR-SYN-01): email magic link or Google. */
export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.status === 'signed-in' || auth.status === 'local') return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signInWithEmail(email.trim());
    setBusy(false);
    if (r.ok) setSent(email.trim());
    else setError(en.auth.failed(r.message));
  };
  const google = async () => {
    setError(null);
    const r = await signInWithGoogle(); // navigates away on success
    if (r) setError(en.auth.failed(r.message));
  };
  const field = 'min-h-11 w-full rounded-md border border-line-strong bg-ui-bg px-3 text-ui-fg';
  const primary = 'min-h-11 w-full rounded-md bg-accent px-4 font-medium text-accent-fg disabled:opacity-50';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">{en.auth.title}</h1>
        <p className="mt-1 text-muted">{en.auth.intro}</p>
      </div>
      {sent ? (
        <p role="status" className="rounded-md border border-line bg-surface p-3">
          {en.auth.checkEmail(sent)}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {en.auth.email}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <button type="submit" disabled={busy || !email.trim()} className={primary}>
            {en.auth.sendLink}
          </button>
        </form>
      )}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        {en.auth.or}
        <span className="h-px flex-1 bg-line" />
      </div>
      <button
        onClick={() => void google()}
        className="min-h-11 w-full rounded-md border border-line-strong px-4 font-medium"
      >
        {en.auth.google}
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
    </main>
  );
}

const TYPES = ['magiclink', 'email', 'signup'] as const;

/** `/auth/confirm?token_hash=…&type=…` (token-hash email links): verify, then go to the library. */
export function AuthConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [rejected, setRejected] = useState(false);
  const token = params.get('token_hash');
  const type = TYPES.find((t) => t === params.get('type')) ?? 'magiclink';
  const failed = !token || rejected;
  useEffect(() => {
    if (token)
      void confirmEmailToken(token, type).then((ok) =>
        ok ? void navigate('/', { replace: true }) : setRejected(true),
      );
  }, [token, type, navigate]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-4">
      <p role="status">{failed ? en.auth.linkInvalid : en.auth.signingIn}</p>
      {failed && (
        <a href="/login" className="text-accent underline">
          {en.auth.title}
        </a>
      )}
    </main>
  );
}
