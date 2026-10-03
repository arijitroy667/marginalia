import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import type { DocumentRow } from '../../core/db/models';
import { db } from '../../core/db/schema';
import { en } from '../../shared/i18n/en';
import { relativeTime } from '../../shared/utils/text';
import { DocumentActions } from './DocumentActions';

export type LibraryView = 'grid' | 'list';

/** Loads a cover only once its card is within 400 px of the viewport (500-document libraries, FR-LIB-04). */
function useCoverUrl(documentId: string, ref: RefObject<Element | null>): string | null {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  const blob = useLiveQuery(
    async () => (near ? (await db.covers.get(documentId))?.blob : undefined),
    [near, documentId],
  );
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export function DocumentCard({
  doc,
  progress,
  view,
}: {
  doc: DocumentRow;
  progress: number | undefined;
  view: LibraryView;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const cover = useCoverUrl(doc.id, ref);
  const status = progress === undefined ? en.library.notStarted : en.library.progress(Math.round(progress * 100));
  const when = doc.lastOpenedAt
    ? en.library.opened(relativeTime(doc.lastOpenedAt))
    : en.library.addedAgo(relativeTime(doc.createdAt));
  const grid = view === 'grid';

  return (
    // content-visibility lets the browser skip layout/paint of off-screen cards (ADR 0009)
    <li
      className="relative"
      style={{ contentVisibility: 'auto', containIntrinsicSize: grid ? 'auto 300px' : 'auto 76px' }}
    >
      <DocumentActions doc={doc} />
      <Link
        ref={ref}
        to={`/read/${doc.id}`}
        className={`group flex rounded-lg text-ui-fg hover:bg-surface ${grid ? 'flex-col gap-2 p-2' : 'items-center gap-3 p-2'}`}
      >
        <div
          className={`shrink-0 overflow-hidden rounded border border-line bg-surface ${grid ? 'aspect-[3/4] w-full' : 'h-14 w-10'}`}
        >
          {cover && <img src={cover} alt="" className="h-full w-full object-contain" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${grid ? 'line-clamp-2 text-sm' : 'truncate'}`}>{doc.title}</p>
          {!grid && doc.author && <p className="truncate text-sm text-muted">{doc.author}</p>}
          <p className="text-xs text-muted">
            {status} · {when}
          </p>
          {progress !== undefined && (
            <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded bg-line">
              <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
