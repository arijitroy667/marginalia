import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { confirmEmailToken, signInWithEmail, signInWithGoogle } from '../../core/auth';
import { DEFAULT_PALETTE } from '../../core/db/models';
import { en } from '../../shared/i18n/en';
import {
  BookmarkIcon,
  CheckIcon,
  HighlighterIcon,
  KeyboardIcon,
  NoteIcon,
  SearchIcon,
  ThemeIcon,
} from '../../shared/ui/icons';
import { useAuth } from './useAuth';
import './landing.css';

const L = en.landing;
const glass = 'mg-glass rounded-2xl';
const primary =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 font-medium text-accent-fg shadow-sm hover:opacity-90 disabled:opacity-50';
const secondary = 'mg-glass inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium text-ui-fg';
const FEATURE_ICONS = [HighlighterIcon, BookmarkIcon, NoteIcon, ThemeIcon, SearchIcon, KeyboardIcon];
const SECTIONS = ['problem', 'features', 'how', 'privacy'] as const;

/**
 * Signed-out landing page at /login: what Marginalia is and the problem it solves, with sign-in (FR-SYN-01) on the
 * first screen. Frosted-glass panels over light in the highlight colours (landing.css).
 */
export function LoginPage() {
  const auth = useAuth();
  if (auth.status === 'signed-in' || auth.status === 'local') return <Navigate to="/" replace />;
  return (
    <div className="mg-landing text-ui-fg">
      <div className="mg-landing-bg" aria-hidden="true">
        <span className="mg-blob" />
        <span className="mg-blob" />
        <span className="mg-blob" />
        <span className="mg-blob" />
      </div>
      <header className="sticky top-0 z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className={`${glass} mx-auto flex max-w-6xl items-center gap-1 py-1 pr-1 pl-3`}>
          <a href="#top" className="flex min-h-11 items-center gap-2 font-semibold">
            <Logo />
            <span className="mg-serif text-lg">{en.app.name}</span>
          </a>
          <nav aria-label={L.nav.label} className="ml-auto hidden md:flex">
            {SECTIONS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted hover:text-ui-fg"
              >
                {L.nav[id]}
              </a>
            ))}
          </nav>
          <a href="#sign-in" className={`${primary} ml-auto px-4 text-sm md:ml-2`}>
            {en.auth.title}
          </a>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-20 md:grid-cols-[1.1fr_0.9fr] md:pt-20 lg:gap-16">
          <div>
            <p className={`${glass} inline-flex rounded-full px-3 py-1 text-sm font-medium`}>{L.eyebrow}</p>
            <h1 className="mg-serif mt-5 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {L.titleStart}
              <span className="mg-marker">{L.titleMark}</span>
              {L.titleEnd}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{L.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#sign-in" className={primary}>
                {L.start}
              </a>
              <a href="#how" className={secondary}>
                {L.seeHow}
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {L.perks.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <CheckIcon width={16} height={16} className="text-accent" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <SignInCard />
        </section>

        <Section id="problem" eyebrow={L.problemEyebrow} title={L.problemTitle} lead={L.problemLead}>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {L.problems.map((p, i) => (
              <li key={p.title} className={`${glass} p-6`}>
                <span className="mg-serif text-3xl text-muted" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="features" eyebrow={L.featuresEyebrow} title={L.featuresTitle}>
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Preview />
            <ul className="grid gap-4 sm:grid-cols-2">
              {L.features.map((f, i) => {
                const FeatureIcon = FEATURE_ICONS[i] ?? CheckIcon;
                return (
                  <li key={f.title} className={`${glass} p-5`}>
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg">
                      <FeatureIcon />
                    </span>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>

        <Section id="how" eyebrow={L.howEyebrow} title={L.howTitle}>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {L.steps.map((step, i) => (
              <li key={step.title} className={`${glass} p-6`}>
                <span
                  className="grid h-10 w-10 place-items-center rounded-full border border-line-strong font-semibold"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="privacy" eyebrow={L.privacyEyebrow} title={L.privacyTitle}>
          <ul className={`${glass} mt-10 grid gap-8 p-6 sm:p-8 md:grid-cols-3`}>
            {L.privacy.map((p) => (
              <li key={p.title}>
                <h3 className="flex items-center gap-2 font-semibold">
                  <CheckIcon width={18} height={18} className="text-accent" />
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pt-8 pb-20">
          <div className={`${glass} flex flex-col items-center gap-4 px-6 py-12 text-center`}>
            <h2 id="cta-title" className="mg-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {L.ctaTitle}
            </h2>
            <p className="max-w-lg text-muted">{L.ctaBody}</p>
            <a href="#sign-in" className={`${primary} mt-2`}>
              {L.ctaButton}
            </a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center text-sm text-muted sm:flex-row sm:justify-between sm:text-left">
        <span className="flex items-center gap-2 font-semibold text-ui-fg">
          <Logo />
          <span className="mg-serif">{en.app.name}</span>
        </span>
        <span>{L.footer}</span>
      </footer>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16">
      <p className="text-sm font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mg-serif mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted">{lead}</p>}
      {children}
    </section>
  );
}

/** The product mark: a page whose middle line is highlighted. */
function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" fill="var(--accent)" />
      <rect x="6.5" y="10" width="11" height="4" rx="1" fill="var(--hl-1, #FFE066)" />
      <path d="M7.5 6.5h9M7.5 12h9M7.5 17.5h6" stroke="var(--accent-fg)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// line widths (%) of the preview page; 0 = paragraph break
const LINES = [96, 100, 90, 100, 94, 99, 70, 0, 97, 100, 88, 62];

/** A page as the reader shows it: highlights with meanings, a bookmark, a margin note, the resume point. */
function Preview() {
  return (
    <figure role="img" aria-label={L.preview} className={`${glass} p-4 sm:p-6`}>
      <div className="relative rounded-xl bg-[var(--page-bg)] py-8 pr-14 pl-10 shadow-lg sm:pr-16 sm:pl-12">
        <span className="mg-line w-3/5" style={{ height: '0.8rem' }} />
        <div className="mt-7 flex flex-col gap-3.5">
          {LINES.map((w, i) =>
            w === 0 ? (
              <span key={i} className="h-1" />
            ) : (
              <div key={i} className={`relative ${i === 2 ? 'mg-wash mg-wash-1' : i === 9 ? 'mg-wash mg-wash-2' : ''}`}>
                <span className="mg-line" style={{ width: `${w}%` }} />
                {i === 5 && (
                  <BookmarkIcon
                    width={16}
                    height={16}
                    className="absolute top-1/2 -left-7 -translate-y-1/2 text-accent"
                  />
                )}
                {i === 3 && (
                  <>
                    <span className="absolute top-1/2 -right-11 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-fg sm:-right-12">
                      <NoteIcon width={14} height={14} />
                    </span>
                    <span className="mg-glass absolute top-5 -right-10 z-10 w-40 rounded-lg px-3 py-2 text-xs text-ui-fg sm:-right-11">
                      {L.previewNote}
                    </span>
                  </>
                )}
                {i === LINES.length - 1 && (
                  <span className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-accent-fg">
                    {L.previewResume}
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {DEFAULT_PALETTE.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-ui-fg">
            <span className="h-3 w-3 rounded-full" style={{ background: p.hex }} />
            {p.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Sign in (FR-SYN-01): email magic link or Google. */
function SignInCard() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const field = 'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-normal text-ui-fg';

  return (
    <section
      id="sign-in"
      aria-labelledby="sign-in-title"
      className={`${glass} flex scroll-mt-24 flex-col gap-5 p-6 sm:p-8`}
    >
      <div>
        <h2 id="sign-in-title" className="mg-serif text-2xl font-semibold">
          {en.auth.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{en.auth.intro}</p>
      </div>
      {sent ? (
        <p role="status" className="rounded-lg border border-line bg-surface p-3">
          {en.auth.checkEmail(sent)}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
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
        className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-4 font-medium"
      >
        {en.auth.google}
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">{en.auth.newHere}</p>
    </section>
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
