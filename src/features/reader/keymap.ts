/**
 * Reader keymap (FR-KEY-01, Appendix A) and its router (FR-KEY-02). One table drives both the keyboard handler and
 * the cheat sheet (FR-KEY-03), and is where remapping (FR-KEY-04, P1) will plug in. Pure: no DOM.
 */
import { canHandleSingleKey, isPrimaryChord, isTypingTarget, type KeyLike } from '../../shared/utils/keys';

export type Action =
  | 'lineDown'
  | 'lineUp'
  | 'extendDown'
  | 'extendUp'
  | 'clear'
  | 'highlight'
  | 'colour'
  | 'note'
  | 'bookmark'
  | 'remove'
  | 'prevBookmark'
  | 'nextBookmark'
  | 'undo'
  | 'redo'
  | 'find'
  | 'goToPage'
  | 'sidebar'
  | 'themeMenu'
  | 'cycleTheme'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'firstPage'
  | 'lastPage'
  | 'nextPage'
  | 'prevPage'
  | 'help';

export type Group = 'lines' | 'annotate' | 'navigate' | 'view';

export interface Binding {
  action: Action;
  /** `KeyboardEvent.key` values; letters in lower case. */
  keys: readonly string[];
  group: Group;
  /** Needs Ctrl (Windows/Linux) or Cmd (macOS). */
  primary?: boolean;
  /** Required Shift state; omitted = either (e.g. `?` is Shift+/ on US layouts). */
  shift?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export const KEYMAP: readonly Binding[] = [
  { action: 'lineDown', keys: ['ArrowDown', 'j'], group: 'lines', shift: false },
  { action: 'lineUp', keys: ['ArrowUp', 'k'], group: 'lines', shift: false },
  { action: 'extendDown', keys: ['ArrowDown'], group: 'lines', shift: true },
  { action: 'extendUp', keys: ['ArrowUp'], group: 'lines', shift: true },
  { action: 'clear', keys: ['Escape'], group: 'lines' },
  { action: 'highlight', keys: ['h'], group: 'annotate' },
  { action: 'colour', keys: DIGITS, group: 'annotate', shift: false },
  { action: 'note', keys: ['n'], group: 'annotate' },
  { action: 'bookmark', keys: ['b'], group: 'annotate' },
  { action: 'remove', keys: ['Delete', 'Backspace'], group: 'annotate' },
  { action: 'undo', keys: ['z'], group: 'annotate', primary: true, shift: false },
  { action: 'redo', keys: ['z'], group: 'annotate', primary: true, shift: true },
  { action: 'prevBookmark', keys: ['['], group: 'navigate' },
  { action: 'nextBookmark', keys: [']'], group: 'navigate' },
  { action: 'find', keys: ['f'], group: 'navigate', primary: true },
  { action: 'find', keys: ['/'], group: 'navigate' },
  { action: 'goToPage', keys: ['g'], group: 'navigate' },
  { action: 'firstPage', keys: ['Home'], group: 'navigate' },
  { action: 'lastPage', keys: ['End'], group: 'navigate' },
  { action: 'nextPage', keys: ['PageDown'], group: 'navigate' },
  { action: 'prevPage', keys: ['PageUp'], group: 'navigate' },
  { action: 'sidebar', keys: ['s'], group: 'view' },
  { action: 'themeMenu', keys: ['t'], group: 'view', shift: false },
  { action: 'cycleTheme', keys: ['t'], group: 'view', shift: true },
  { action: 'zoomIn', keys: ['=', '+'], group: 'view', primary: true },
  { action: 'zoomOut', keys: ['-'], group: 'view', primary: true },
  { action: 'zoomReset', keys: ['0'], group: 'view', primary: true },
  { action: 'help', keys: ['?'], group: 'view' },
];

export interface Hit {
  action: Action;
  /** The normalised key, e.g. the digit of a `colour` hit. */
  key: string;
}

/**
 * The binding for a keydown, or null. Single keys never fire in text fields, during IME composition or with
 * Ctrl/Cmd/Alt held; Ctrl/Cmd chords fire everywhere except undo/redo inside text fields (their own undo).
 */
export function route(e: KeyLike & { shiftKey?: boolean }, keymap: readonly Binding[] = KEYMAP): Hit | null {
  if (e.isComposing || e.keyCode === 229) return null;
  const primary = isPrimaryChord(e);
  if (!primary && !canHandleSingleKey(e)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const b = keymap.find(
    (b) => !!b.primary === primary && b.keys.includes(key) && (b.shift === undefined || b.shift === !!e.shiftKey),
  );
  if (!b || (primary && (b.action === 'undo' || b.action === 'redo') && isTypingTarget(e.target))) return null;
  return { action: b.action, key };
}
