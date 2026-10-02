/** Ephemeral reader UI state (PRD §8.3: Zustand for UI only — never domain data). */
import { create } from 'zustand';
import type { Anchor } from '../../core/anchors/types';
import type { Line } from '../../core/line-engine';

/** A tapped line (the line cursor) or a native text selection on one page. */
export type Selection =
  | { kind: 'line'; page: number; line: Line; anchor: Anchor; text: string }
  | { kind: 'range'; page: number; anchor: Anchor; text: string; touch: boolean };

interface ReaderState {
  selection: Selection | null;
  select: (selection: Selection | null) => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
}));
