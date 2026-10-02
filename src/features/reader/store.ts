import { create } from 'zustand';
import type { Anchor, NRect } from '../../core/anchors/types';
import type { Line } from '../../core/line-engine';

/** Ephemeral reader UI state (PRD §7: Zustand for UI only). */
export type Selection =
  | { kind: 'line'; page: number; line: Line; anchor: Anchor; text: string }
  | { kind: 'range'; page: number; anchor: Anchor; text: string; touch: boolean };

export const FLASH_MS = 1200; // jump target pulse (PRD §10.4)

interface ReaderState {
  selection: Selection | null;
  select: (selection: Selection | null) => void;
  flash: { page: number; rects: NRect[]; id: number } | null;
  flashAt: (anchor: Anchor) => void;
}

let flashes = 0;

export const useReaderStore = create<ReaderState>((set, get) => ({
  selection: null,
  select: (selection) => set({ selection }),
  flash: null,
  flashAt: (anchor) => {
    const id = ++flashes;
    set({ flash: { page: anchor.page, rects: anchor.rects, id } });
    setTimeout(() => get().flash?.id === id && set({ flash: null }), FLASH_MS);
  },
}));
