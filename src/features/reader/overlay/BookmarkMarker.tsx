import { Popover } from 'radix-ui';
import { useRef, useState } from 'react';
import type { AnnotationRow } from '../../../core/db/models';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import { en } from '../../../shared/i18n/en';
import { BookmarkIcon } from '../../../shared/ui/icons';
import { toast } from '../../../shared/ui/toast';
import { removeAnnotation, setLabel } from '../commands';
import { undoable } from '../LineActions';

/** Gutter ribbon (FR-BKM-02); click/tap opens a popover to rename or delete it (Appendix A). */
export function BookmarkMarker({ row }: { row: AnnotationRow }) {
  const [draft, setDraft] = useState<string | null>(null);
  const deleting = useRef(false);
  const touch = useMediaQuery('(pointer: coarse)'); // phones: opening must not pop the on-screen keyboard
  const shown = row.label ?? row.anchor.quote.exact.slice(0, 60);
  const commit = () => {
    if (draft === null || deleting.current) return;
    const to = draft.trim().slice(0, 200) || null;
    setDraft(null);
    if (to !== row.label) void setLabel(row.id, row.label, to).catch(() => toast(en.reader.saveFailed));
  };
  return (
    <Popover.Root onOpenChange={(open) => !open && commit()}>
      <Popover.Trigger className="mg-ribbon" aria-label={en.reader.bookmarkMarker(shown || en.reader.pageShort(row.page))}>
        <BookmarkIcon fill="currentColor" width={18} height={18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="left" align="center" sideOffset={8} collisionPadding={8} className="mg-popover" onOpenAutoFocus={(e) => touch && e.preventDefault()}>
          <p className="text-xs text-muted">{en.reader.bookmarkHeading(row.page)}</p>
          <input
            aria-label={en.reader.bookmarkLabel}
            className="min-h-11 w-full rounded-md border border-line-strong bg-ui-bg px-2 text-ui-fg"
            value={draft ?? row.label ?? ''}
            placeholder={row.anchor.quote.exact.slice(0, 60)}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          <Popover.Close
            className="min-h-11 self-end rounded-md px-3 text-sm font-medium text-accent hover:bg-ui-bg"
            onClick={() => {
              deleting.current = true; // closing must not save a pending rename of a deleted bookmark
              void removeAnnotation(row.id).then((c) => toast(en.reader.bookmarkRemoved, undoable(c)), () => toast(en.reader.saveFailed));
            }}
          >
            {en.reader.deleteBookmark}
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
