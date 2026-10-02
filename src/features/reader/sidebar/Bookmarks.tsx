import { useLiveQuery } from 'dexie-react-hooks';
import type { Anchor } from '../../../core/anchors/types';
import { annotationsRepo } from '../../../core/db/repos';
import { en } from '../../../shared/i18n/en';
import { inDocumentOrder } from '../navigation';

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Bookmarks tab (FR-BKM-03): page, label, snippet, created; a click jumps and flashes the line. */
export function Bookmarks({ documentId, onJump }: { documentId: string; onJump: (anchor: Anchor) => void }) {
  const rows = useLiveQuery(async () => inDocumentOrder(await annotationsRepo.ofKind(documentId, 'bookmark')), [documentId]);
  if (!rows) return null;
  if (!rows.length) return <p className="p-4 text-sm text-muted">{en.reader.noBookmarks}</p>;
  return (
    <ul className="flex flex-col p-1">
      {rows.map((b) => {
        const snippet = b.anchor.quote.exact;
        const title = b.label ?? (snippet.slice(0, 60) || en.reader.pageThumb(b.page));
        return (
          <li key={b.id}>
            <button onClick={() => onJump(b.anchor)} className="flex w-full flex-col gap-0.5 rounded px-2 py-2 text-left hover:bg-ui-bg">
              <span className="line-clamp-2 text-sm text-ui-fg">{title}</span>
              {snippet && !snippet.startsWith(title) && <span className="line-clamp-1 text-xs text-muted">{snippet}</span>}
              <span className="text-xs text-muted">
                {en.reader.pageShort(b.page)} · {date.format(new Date(b.createdAt))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
