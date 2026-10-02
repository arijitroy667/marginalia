import { describe, expect, it } from 'vitest';
import { canHandleSingleKey, isPrimaryChord, isTypingTarget } from './keys';

const div = { tagName: 'DIV' };
const key = (over: object = {}) => ({ key: 'b', target: div, ...over });

describe('canHandleSingleKey (FR-KEY-02)', () => {
  it('fires on plain keys outside text fields', () => {
    expect(canHandleSingleKey(key())).toBe(true);
    expect(canHandleSingleKey(key({ key: '?', shiftKey: true }))).toBe(true);
  });
  it('never fires in inputs, textareas, selects or contenteditable', () => {
    for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT' }, { tagName: 'input', type: 'search' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }])
      expect(canHandleSingleKey(key({ target })), JSON.stringify(target)).toBe(false);
  });
  it('fires on non-text inputs (checkbox, button)', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(canHandleSingleKey(key({ target: { tagName: 'BUTTON' } }))).toBe(true);
  });
  it('never fires during IME composition', () => {
    expect(canHandleSingleKey(key({ isComposing: true }))).toBe(false);
    expect(canHandleSingleKey(key({ keyCode: 229 }))).toBe(false);
  });
  it('never fires with Ctrl, Meta or Alt held (AltGr = Ctrl+Alt)', () => {
    for (const m of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { ctrlKey: true, altKey: true }])
      expect(canHandleSingleKey(key(m))).toBe(false);
  });
});

describe('isPrimaryChord', () => {
  it('is Ctrl or Cmd without Alt', () => {
    expect(isPrimaryChord(key({ ctrlKey: true }))).toBe(true);
    expect(isPrimaryChord(key({ metaKey: true }))).toBe(true);
    expect(isPrimaryChord(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isPrimaryChord(key())).toBe(false);
  });
});
