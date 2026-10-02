import { useLiveQuery } from 'dexie-react-hooks';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { intersects } from '../../../core/anchors/anchor';
import type { Anchor } from '../../../core/anchors/types';
import type { AnnotationKind, AnnotationRow } from '../../../core/db/models';
import { annotationsRepo } from '../../../core/db/repos';
import { en } from '../../../shared/i18n/en';
import { BookmarkIcon, EyeIcon, EyeOffIcon, NoteIcon } from '../../../shared/ui/icons';
import { Markdown } from '../../../shared/ui/Markdown';
import { useSettings } from '../../settings/useSettings';
import { inDocumentOrder } from '../navigation';
import { useReaderStore } from '../store';

type View = 'all' | AnnotationKind;
const VIEWS: View[] = ['all', 'highlight', 'note', 'bookmark'];
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const tab =
  'min-h-11 flex-1 border-b-2 border-transparent px-1 text-xs text-muted data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-ui-fg';

/**
 * Annotation panel (FR-PNL-01, FR-NOT-04, FR-BKM-03): All / Highlights / Notes / Bookmarks, grouped by page, filtered by
 * colour meaning and by text over quotes, notes and labels. A click jumps to the line and pulses it.
 */
export function Annotations({ documentId, onJump }: { documentId: string; onJump: (anchor: Anchor) => void }) {
  const { palette } = useSettings();
  const rows = useLiveQuery(() => annotationsRepo.ofDocument(documentId), [documentId]);
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [colours, setColours] = useState<ReadonlySet<number>>(new Set());

  const highlights = (rows ?? []).filter((a) => a.kind === 'highlight');
  const hidden = useReaderStore((s) => s.hidden);
  const toggleHidden = useReaderStore((s) => s.toggleHidden);
  // a note takes the colour of the highlight on its line; bookmarks have none
  const colourOf = (a: AnnotationRow) =>
    a.kind === 'note' ? (highlights.find((h) => intersects(h.anchor, a.anchor))?.colorId ?? null) : a.colorId;
  const q = query.trim().toLowerCase();
  const shown = inDocumentOrder(rows ?? []).filter(
    (a) =>
      (view === 'all' || a.kind === view) &&
      (colours.size === 0 || colours.has(colourOf(a) ?? 0)) &&
      (!q || [a.anchor.quote.exact, a.body, a.label].some((t) => t?.toLowerCase().includes(q))),
  );
  const pages = new Map<number, AnnotationRow[]>();
  for (const a of shown) pages.set(a.page, [...(pages.get(a.page) ?? []), a]);
  const toggle = (id: number) =>
    setColours((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const list = !rows ? null : shown.length === 0 ? (
    <p className="p-4 text-sm text-muted">
      {q || colours.size ? en.reader.noMatchingAnnotations : en.reader.emptyPanel[view]}
    </p>
  ) : (
    <div className="flex flex-col gap-3 p-2">
      {[...pages].map(([page, items]) => (
        <section key={page} aria-label={en.reader.pageThumb(page)}>
          <h3 className="px-2 pb-1 text-xs font-medium text-muted">{en.reader.pageThumb(page)}</h3>
          <ul className="flex flex-col">
            {items.map((a) => {
              const colour = palette.find((p) => p.id === colourOf(a));
              return (
                <li key={a.id} className="rounded hover:bg-ui-bg">
                  <button
                    onClick={() => onJump(a.anchor)}
                    className="flex w-full flex-col gap-1 px-2 pt-2 pb-1 text-left"
                  >
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {colour ? (
                        <span
                          className="size-3 shrink-0 rounded-full border border-black/30"
                          style={{ background: colour.hex }}
                          title={colour.label}
                        />
                      ) : a.kind === 'bookmark' ? (
                        <BookmarkIcon width={14} height={14} />
                      ) : (
                        <NoteIcon width={14} height={14} />
                      )}
                      <span>
                        {en.reader.kindLabel[a.kind]}
                        {colour && ` · ${colour.label}`} · {date.format(new Date(a.createdAt))}
                      </span>
                    </span>
                    {a.kind === 'bookmark' && a.label && <span className="text-sm text-ui-fg">{a.label}</span>}
                    {a.anchor.quote.exact &&
                      !(a.kind === 'bookmark' && a.label && a.anchor.quote.exact.startsWith(a.label)) && (
                        <span className="line-clamp-2 text-sm text-ui-fg">{a.anchor.quote.exact}</span>
                      )}
                  </button>
                  {/* outside the button: note links must be clickable on their own (FR-NOT-05) */}
                  {a.kind === 'note' && a.body && (
                    <Markdown
                      source={a.body}
                      className="mx-2 mb-2 max-h-40 overflow-hidden border-l-4 border-line pl-2 text-sm text-ui-fg"
                      style={colour ? { borderLeftColor: colour.hex } : undefined}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <input
          type="search"
          aria-label={en.reader.filterAnnotations}
          placeholder={en.reader.filterPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-9 w-full rounded-md border border-line-strong bg-ui-bg px-2 text-sm text-ui-fg"
        />
        <div role="group" aria-label={en.reader.filterByColour} className="flex flex-wrap gap-1">
          {palette.map((p) => (
            <span
              key={p.id}
              className="flex items-center rounded-full border border-line has-[[aria-pressed=true]:first-child]:border-accent"
            >
              <button
                aria-pressed={colours.has(p.id)}
                onClick={() => toggle(p.id)}
                className="flex min-h-8 items-center gap-1 rounded-l-full pl-2 pr-1 text-xs text-ui-fg aria-pressed:bg-ui-bg aria-pressed:font-medium"
              >
                <span className="size-3 rounded-full border border-black/30" style={{ background: p.hex }} />
                {p.label}
                <span className="text-muted">{highlights.filter((h) => h.colorId === p.id).length}</span>
              </button>
              <button
                aria-pressed={!hidden.includes(p.id)}
                aria-label={en.reader.showColour(p.label)}
                title={en.reader.showColour(p.label)}
                onClick={() => toggleHidden(p.id)}
                className="grid min-h-8 min-w-8 place-items-center rounded-r-full text-muted"
              >
                {hidden.includes(p.id) ? <EyeOffIcon width={14} height={14} /> : <EyeIcon width={14} height={14} />}
              </button>
            </span>
          ))}
        </div>
      </div>
      <Tabs.Root value={view} onValueChange={(v) => setView(v as View)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List aria-label={en.reader.annotationTypes} className="flex border-b border-line">
          {VIEWS.map((v) => (
            <Tabs.Trigger key={v} value={v} className={tab}>
              {en.reader.views[v]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {VIEWS.map((v) => (
          <Tabs.Content key={v} value={v} className="min-h-0 flex-1 overflow-auto outline-none">
            {list}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
