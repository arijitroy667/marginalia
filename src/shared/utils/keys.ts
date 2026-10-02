/** Minimal shapes so the guards are unit-testable without a DOM. */
interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}
export interface KeyLike {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target: EventTarget | TargetLike | null;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image']);

/** True if keystrokes there are text entry (input/textarea/select/contenteditable). */
export function isTypingTarget(target: KeyLike['target']): boolean {
  const t = target as TargetLike | null;
  if (!t?.tagName) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase());
}

/**
 * Single-key shortcuts fire only outside text fields, never during IME composition (keyCode 229 covers
 * Safari's composition events) and never with Ctrl/Meta/Alt held (FR-KEY-02). Shift is part of the key.
 */
export function canHandleSingleKey(e: KeyLike): boolean {
  return !e.isComposing && e.keyCode !== 229 && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
}

/** Ctrl on Windows/Linux, Cmd on macOS/iOS, without Alt (AltGr = Ctrl+Alt on European layouts, H3). */
export const isPrimaryChord = (e: KeyLike): boolean => Boolean(e.ctrlKey || e.metaKey) && !e.altKey && !e.isComposing;
