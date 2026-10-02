import { z } from 'zod';
import { create } from 'zustand';
import type { Anchor, NRect } from '../../core/anchors/types';
import type { AnnotationRow } from '../../core/db/models';
import type { Line } from '../../core/line-engine';

/** Ephemeral reader UI state (PRD §7: Zustand for UI only). */
export type Selection =
  | { kind: 'line'; page: number; line: Line; anchor: Anchor; text: string; from?: Line } // from: fixed end of a Shift+arrow range
  | { kind: 'range'; page: number; anchor: Anchor; text: string; touch: boolean }
  | { kind: 'region'; page: number; anchor: Anchor; text: '' }; // rectangle on a page without text (FR-LIN-08)

export const FLASH_MS = 1200; // jump target pulse (PRD §10.4)
export const RESUME_MARK_MS = 2000; // resume marker (FR-BKM-04)

// Highlight colours hidden in the document (FR-HLT-06): a device-local view preference, so localStorage (rule 8).
const HIDDEN_KEY = 'mg.hiddenColours';
const HiddenSchema = z.array(z.number().int().min(1).max(8)).catch([]);
function loadHidden(): number[] {
  try {
    return HiddenSchema.parse(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

interface ReaderState {
  selection: Selection | null;
  select: (selection: Selection | null) => void;
  /** Rectangle being dragged on a page without text, before it becomes a `region` selection. */
  region: { page: number; rect: NRect } | null;
  setRegion: (region: { page: number; rect: NRect } | null) => void;
  flash: { page: number; rects: NRect[]; id: number } | null;
  flashAt: (anchor: Anchor) => void;
  resume: { anchor: Anchor; id: number } | null;
  markResume: (anchor: Anchor) => void;
  /**
   * Open note editor (FR-NOT-01/03): the line it is anchored to, the notes on it (none = a new note), and the line
   * selection to give back on close, so B / H / J keep working on that line.
   */
  notes: { anchor: Anchor; rows: AnnotationRow[]; id: number; restore: Selection | null } | null;
  openNotes: (anchor: Anchor, rows: AnnotationRow[]) => void;
  closeNotes: () => void;
  hidden: number[];
  toggleHidden: (colorId: number) => void;
}

let flashes = 0;

export const useReaderStore = create<ReaderState>((set, get) => ({
  selection: null,
  select: (selection) => set({ selection }),
  region: null,
  setRegion: (region) => set({ region }),
  flash: null,
  flashAt: (anchor) => {
    const id = ++flashes;
    set({ flash: { page: anchor.page, rects: anchor.rects, id } });
    setTimeout(() => get().flash?.id === id && set({ flash: null }), FLASH_MS);
  },
  resume: null,
  markResume: (anchor) => {
    const id = ++flashes;
    set({ resume: { anchor, id } });
    setTimeout(() => get().resume?.id === id && set({ resume: null }), RESUME_MARK_MS);
  },
  notes: null,
  openNotes: (anchor, rows) => {
    const sel = get().selection;
    set({ notes: { anchor, rows, id: ++flashes, restore: sel?.kind === 'line' ? sel : null }, selection: null });
  },
  closeNotes: () => {
    const notes = get().notes;
    if (notes) set({ notes: null, selection: notes.restore });
  },
  hidden: loadHidden(),
  toggleHidden: (colorId) => {
    const cur = get().hidden;
    const hidden = cur.includes(colorId) ? cur.filter((c) => c !== colorId) : [...cur, colorId];
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
    } catch {
      /* private mode: lasts this session */
    }
    set({ hidden });
  },
}));
