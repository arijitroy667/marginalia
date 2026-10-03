import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { DocumentRow } from '../../core/db/models';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { usePref } from '../../shared/hooks/usePref';
import { en } from '../../shared/i18n/en';
import { searchKey } from '../../shared/utils/text';
import { AnnotationResults } from './AnnotationResults';
import { toast } from '../../shared/ui/toast';
import { addPdf } from './addPdf';
import { DocumentCard, type LibraryView } from './DocumentCard';
import { usePasswordPrompt } from './PasswordDialog';

const SORTS = ['opened', 'title', 'added'] as const;
type Sort = (typeof SORTS)[number];
const VIEWS = ['grid', 'list'] as const;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);
const ORDER: Record<Sort, (a: DocumentRow, b: DocumentRow) => number> = {
  opened: (a, b) => time(b.lastOpenedAt) - time(a.lastOpenedAt) || time(b.createdAt) - time(a.createdAt),
  title: (a, b) => collator.compare(a.title, b.title),
  added: (a, b) => time(b.createdAt) - time(a.createdAt),
};

export function LibraryPage() {
  const data = useLiveQuery(async () => {
    const [docs, positions] = await Promise.all([
      db.documents.filter((d) => d.deletedAt === null).toArray(),
      db.positions.toArray(),
    ]);
    return { docs, progress: new Map(positions.map((p) => [p.documentId, p.progress])) };
  }, []);
  const [sort, setSort] = usePref<Sort>('library.sort', SORTS, 'opened');
  const [view, setView] = usePref<LibraryView>('library.view', VIEWS, 'grid');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const { prompt, dialog } = usePasswordPrompt();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = searchKey(deferredQuery);
    return data.docs.filter((d) => !q || searchKey(d.title).includes(q)).sort(ORDER[sort]);
  }, [data, deferredQuery, sort]);

  async function add(files: File[]) {
    for (const file of files) {
      const r = await addPdf(file, prompt(file.name));
      if (r.kind === 'rejected') toast(en.library.rejected[r.reason](file.name));
      else if (r.kind === 'existing') {
        toast(en.library.existing(r.document.title));
        void navigate(`/read/${r.document.id}`); // same bytes: open the existing document (FR-LIB-02)
      } else
        toast((r.document.storageMode === 'device' ? en.library.addedDeviceOnly : en.library.added)(r.document.title));
    }
  }
  const pick = () => void platform.pickPdfFiles().then(add);
  const empty = data !== undefined && data.docs.length === 0;

  return (
    <div
      className={`mx-auto min-h-full max-w-6xl px-4 py-5 sm:px-6 ${dragging ? 'outline-2 -outline-offset-4 outline-accent outline-dashed' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void add([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{en.library.title}</h1>
        <button className="ml-auto min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg" onClick={pick}>
          {en.library.add}
        </button>
      </div>

      {empty ? (
        <section className="mt-10 flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-line-strong px-6 py-16 text-center">
          <h2 className="text-xl font-semibold">{en.library.emptyTitle}</h2>
          <p className="max-w-md text-muted">{en.library.emptyBody}</p>
          <button className="min-h-11 rounded-md bg-accent px-6 font-medium text-accent-fg" onClick={pick}>
            {en.library.add}
          </button>
        </section>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1 basis-56">
              <span className="sr-only">{en.library.search}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={en.library.search}
                className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-ui-fg"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              {en.library.sortBy}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-ui-fg"
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {en.library.sorts[s]}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label={en.library.viewLabel} className="flex rounded-md border border-line-strong">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-11 px-3 text-sm ${view === v ? 'bg-accent text-accent-fg' : 'text-ui-fg'}`}
                >
                  {en.library.views[v]}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 hidden text-sm text-muted md:block">{en.library.dropHere}</p>
          {data && visible.length === 0 && <p className="mt-8 text-muted">{en.library.noMatch(query)}</p>}
          <AnnotationResults query={deferredQuery} />
          <ul
            aria-label={en.library.title}
            className={`mt-4 ${view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3' : 'flex flex-col'}`}
          >
            {visible.map((d) => (
              <DocumentCard key={d.id} doc={d} progress={data?.progress.get(d.id)} view={view} />
            ))}
          </ul>
        </>
      )}
      {dialog}
    </div>
  );
}
