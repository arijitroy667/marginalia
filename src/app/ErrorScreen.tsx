import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { en } from '../shared/i18n/en';

/** Route error boundary. Shows no error details: they may contain PDF text or notes (NFR-SEC-06). */
export function ErrorScreen() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <h1 className="text-xl font-semibold">{notFound ? en.errors.notFoundTitle : en.errors.title}</h1>
      <p className="text-muted">{notFound ? en.errors.notFoundBody : en.errors.body}</p>
      {notFound ? (
        <Link to="/" className="rounded-md bg-accent px-4 py-2 text-accent-fg">
          {en.errors.backToLibrary}
        </Link>
      ) : (
        <button className="min-h-11 rounded-md bg-accent px-4 text-accent-fg" onClick={() => window.location.reload()}>
          {en.errors.reload}
        </button>
      )}
    </div>
  );
}
