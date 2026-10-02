import { Link } from 'react-router';
import { en } from '../../shared/i18n/en';

export type ReaderErrorKind = keyof typeof en.reader.errors;

/** Human-readable error state with recovery actions (FR-RDR-12). */
export function ReaderError({ kind, onRetry }: { kind: ReaderErrorKind; onRetry?: () => void }) {
  const copy = en.reader.errors[kind];
  return (
    <div role="alert" className="mx-auto flex h-dvh max-w-md flex-col justify-center gap-3 p-8">
      <h1 className="text-xl font-semibold">{copy.title}</h1>
      <p className="text-muted">{copy.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onRetry && kind !== 'not-found' && (
          <button className="min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg" onClick={onRetry}>
            {kind === 'locked' ? en.reader.enterPassword : en.reader.tryAgain}
          </button>
        )}
        <Link to="/" className="flex min-h-11 items-center rounded-md border border-line-strong px-4 text-ui-fg">
          {en.errors.backToLibrary}
        </Link>
      </div>
    </div>
  );
}
