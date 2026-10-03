import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '../../core/db/schema';
import { en } from '../../shared/i18n/en';
import { BookmarkIcon, NoteIcon } from '../../shared/ui/icons';
import { useSettings } from '../settings/useSettings';
import { searchAnnotations } from './searchAnnotations';

const LIMIT = 50;

/** Library-wide annotation search results (FR-PNL-02): book, page, snippet; a click opens the line. */
export function AnnotationResults({ query }: { query: string }) {
  const { palette } = useSettings();
  const hits = useLiveQuery(
    async () =>
      query.trim().length < 2
        ? []
        : searchAnnotations(await db.documents.toArray(), await db.annotations.toArray(), query, LIMIT + 1),
    [query],
  );
  if (!hits?.length) return null;
  return (
    <section aria-labelledby="annotation-hits" className="mt-8">
      <h2 id="annotation-hits" className="mb-2 text-sm font-medium text-muted">
        {en.library.inAnnotations}
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {hits.slice(0, LIMIT).map((h) => {
          const colour = palette.find((p) => p.id === h.annotation.colorId);
          return (
            <li key={h.annotation.id}>
              <Link to={`/read/${h.document.id}?a=${h.annotation.id}`} className="flex gap-3 p-3 hover:bg-ui-bg">
                <span className="mt-1 shrink-0 text-muted" aria-hidden="true">
                  {colour ? (
                    <span
                      className="block size-3 rounded-full border border-black/30"
                      style={{ background: colour.hex }}
                    />
                  ) : h.annotation.kind === 'bookmark' ? (
                    <BookmarkIcon width={14} height={14} />
                  ) : (
                    <NoteIcon width={14} height={14} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">
                    {en.library.annotationHit(h.document.title, h.annotation.page)}
                  </span>
                  <span className="block text-sm text-ui-fg">
                    {h.before}
                    {h.match && <mark className="rounded bg-[var(--hl-1,#ffe066)] px-0.5 text-black">{h.match}</mark>}
                    {h.after}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {hits.length > LIMIT && <p className="mt-2 text-xs text-muted">{en.library.moreHits(LIMIT)}</p>}
    </section>
  );
}
