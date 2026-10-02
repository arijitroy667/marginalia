import { useLiveQuery } from 'dexie-react-hooks';
import { intersects } from '../../core/anchors/anchor';
import type { PaletteEntry } from '../../core/db/models';
import { annotationsRepo } from '../../core/db/repos';
import { platform } from '../../core/platform';
import { en } from '../../shared/i18n/en';
import { BookmarkIcon, NoteIcon } from '../../shared/ui/icons';
import { toast } from '../../shared/ui/toast';
import { removeOnLine, toggleBookmark, toggleHighlight, undoCommand, type Command } from './commands';
import type { LineTarget } from './navigation';
import { useReaderStore, type Selection } from './store';

/** Toast action that reverts exactly this step (FR-KEY-06). */
export const undoable = (c: Command) => ({
  label: en.common.undo,
  run: () => void undoCommand(c).catch(() => toast(en.reader.undoFailed)),
});

const clearSelection = () => {
  useReaderStore.getState().select(null);
  window.getSelection()?.removeAllRanges();
};

/**
 * Colour the selection (toolbar swatch, `H`, `1`-`8`): create, replace or remove (FR-HLT-01/03), with an Undo toast
 * for replace/remove (FR-KEY-06). A native selection is consumed; a line selection stays for the next action.
 */
export async function applyColour(
  documentId: string,
  colorId: number,
  palette: readonly PaletteEntry[],
  setActive: (id: number) => void,
): Promise<void> {
  const sel = useReaderStore.getState().selection;
  if (!sel) return;
  try {
    const { op, command } = await toggleHighlight(documentId, sel.anchor, colorId);
    if (op !== 'removed') setActive(colorId);
    if (sel.kind !== 'line') clearSelection(); // ranges and regions are consumed
    if (op === 'removed') toast(en.reader.highlightRemoved, undoable(command));
    if (op === 'replaced')
      toast(
        en.reader.highlightChanged(palette.find((p) => p.id === colorId)?.label ?? String(colorId)),
        undoable(command),
      );
  } catch {
    toast(en.reader.saveFailed);
  }
}

/** Quick bookmark (FR-BKM-01/02): toggles a bookmark on the target line, labelled with its first 60 characters. */
export async function quickBookmark(documentId: string, target: LineTarget | null): Promise<void> {
  if (!target) return;
  try {
    const { op, command } = await toggleBookmark(documentId, target.anchor, target.text.trim().slice(0, 60) || null);
    toast(op === 'created' ? en.reader.bookmarked(target.anchor.page) : en.reader.bookmarkRemoved, undoable(command));
  } catch {
    toast(en.reader.saveFailed);
  }
}

/** `N` / toolbar Note (FR-NOT-01): open the notes on the selected line, or a new one anchored to it. */
export async function openNoteEditor(documentId: string): Promise<void> {
  const sel = useReaderStore.getState().selection;
  if (!sel) return;
  const rows = (await annotationsRepo.onPage(documentId, sel.page)).filter(
    (a) => a.kind === 'note' && intersects(a.anchor, sel.anchor),
  );
  window.getSelection()?.removeAllRanges();
  useReaderStore.getState().openNotes(sel.anchor, rows);
}

/** Delete/Backspace on a selection: remove its highlights and bookmarks, one Undo step (FR-HLT-04, Appendix A). */
export async function deleteOnSelection(documentId: string): Promise<void> {
  const sel = useReaderStore.getState().selection;
  if (!sel) return;
  try {
    const res = await removeOnLine(documentId, sel.anchor);
    if (!res) return;
    const [only] = res.kinds;
    const msg =
      res.kinds.length > 1
        ? en.reader.removedOnLine
        : only === 'bookmark'
          ? en.reader.bookmarkRemoved
          : en.reader.highlightRemoved;
    toast(msg, undoable(res.command));
  } catch {
    toast(en.reader.saveFailed);
  }
}

interface Props {
  documentId: string;
  selection: Selection;
  palette: readonly PaletteEntry[];
  active: number;
  setActive: (id: number) => void;
  compact: boolean;
}

/**
 * Line toolbar contents (FR-LIN-01, §10.2/§10.3): palette swatches | Note, Bookmark, Copy, Close. Phones show
 * swatches | Note, Bookmark only: long-press gives the system Copy, and a tap on blank space closes.
 */
export function LineActions({ documentId, selection, palette, active, setActive, compact }: Props) {
  const onLine = useLiveQuery(
    async () =>
      (await annotationsRepo.onPage(documentId, selection.page)).filter((a) => intersects(a.anchor, selection.anchor)),
    [documentId, selection],
  );
  const applied = onLine?.find((a) => a.kind === 'highlight')?.colorId ?? null;
  const bookmarked = onLine?.some((a) => a.kind === 'bookmark') ?? false;
  const noted = onLine?.some((a) => a.kind === 'note') ?? false;
  return (
    <>
      <span role="group" aria-label={en.reader.colours} className="mg-swatches">
        {palette.map((p, i) => (
          <button
            key={p.id}
            className="mg-swatch"
            aria-label={en.reader.highlightWith(p.label)}
            aria-pressed={applied === p.id}
            data-active={p.id === active || undefined}
            title={en.reader.swatchTitle(p.label, i + 1)}
            onClick={() => void applyColour(documentId, p.id, palette, setActive)}
          >
            <span style={{ background: p.hex }} />
          </button>
        ))}
      </span>
      <span className="mg-sep" aria-hidden="true" />
      <button
        aria-label={en.reader.note}
        title={`${en.reader.note} (N)`}
        className="mg-icon-btn"
        data-on={noted || undefined}
        onClick={() => void openNoteEditor(documentId)}
      >
        <NoteIcon fill={noted ? 'currentColor' : 'none'} />
        {!compact && <span aria-hidden="true">{en.reader.note}</span>}
      </button>
      <button
        aria-label={en.reader.bookmark}
        aria-pressed={bookmarked}
        title={`${en.reader.bookmark} (B)`}
        className="mg-icon-btn"
        onClick={() => void quickBookmark(documentId, selection)}
      >
        <BookmarkIcon fill={bookmarked ? 'currentColor' : 'none'} />
        {!compact && <span aria-hidden="true">{en.reader.bookmark}</span>}
      </button>
      {!compact && (
        <>
          {selection.text && (
            <button
              onClick={() =>
                void platform.copyText(selection.text).then((ok) => toast(ok ? en.reader.copied : en.reader.copyFailed))
              }
            >
              {en.reader.copy}
            </button>
          )}
          <button aria-label={en.reader.clearSelection} onClick={clearSelection}>
            ✕
          </button>
        </>
      )}
    </>
  );
}
