import { useLiveQuery } from 'dexie-react-hooks';
import { intersects } from '../../core/anchors/anchor';
import type { PaletteEntry } from '../../core/db/models';
import { annotationsRepo } from '../../core/db/repos';
import { platform } from '../../core/platform';
import { en } from '../../shared/i18n/en';
import { toast } from '../../shared/ui/toast';
import { removeHighlights, toggleHighlight, undoCommand, type Command } from './commands';
import { useReaderStore, type Selection } from './store';

const undoable = (c: Command) => ({ label: en.common.undo, run: () => void undoCommand(c).catch(() => toast(en.reader.undoFailed)) });

const clearSelection = () => {
  useReaderStore.getState().select(null);
  window.getSelection()?.removeAllRanges();
};

/**
 * Colour the selection (toolbar swatch, `H`, `1`-`8`): create, replace or remove (FR-HLT-01/03), with an Undo toast
 * for replace/remove (FR-KEY-06). A native selection is consumed; a line selection stays for the next action.
 */
export async function applyColour(documentId: string, colorId: number, palette: readonly PaletteEntry[], setActive: (id: number) => void): Promise<void> {
  const sel = useReaderStore.getState().selection;
  if (!sel) return;
  try {
    const { op, command } = await toggleHighlight(documentId, sel.anchor, colorId);
    if (op !== 'removed') setActive(colorId);
    if (sel.kind === 'range') clearSelection();
    if (op === 'removed') toast(en.reader.highlightRemoved, undoable(command));
    if (op === 'replaced') toast(en.reader.highlightChanged(palette.find((p) => p.id === colorId)?.label ?? String(colorId)), undoable(command));
  } catch {
    toast(en.reader.saveFailed);
  }
}

/** Delete/Backspace on a selection: remove its highlights, one Undo step (FR-HLT-04). */
export async function deleteOnSelection(documentId: string): Promise<void> {
  const sel = useReaderStore.getState().selection;
  if (!sel) return;
  try {
    const command = await removeHighlights(documentId, sel.anchor);
    if (command) toast(en.reader.highlightRemoved, undoable(command));
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
}

/** Line toolbar contents (FR-LIN-01, §10.2): palette swatches | Copy, Close. */
export function LineActions({ documentId, selection, palette, active, setActive }: Props) {
  const applied = useLiveQuery(
    async () => (await annotationsRepo.onPage(documentId, selection.page)).find((a) => a.kind === 'highlight' && intersects(a.anchor, selection.anchor))?.colorId ?? null,
    [documentId, selection],
  );
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
      <button onClick={() => void platform.copyText(selection.text).then((ok) => toast(ok ? en.reader.copied : en.reader.copyFailed))}>{en.reader.copy}</button>
      <button aria-label={en.reader.clearSelection} onClick={clearSelection}>
        ✕
      </button>
    </>
  );
}
