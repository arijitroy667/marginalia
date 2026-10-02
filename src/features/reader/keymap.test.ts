import { describe, expect, it } from 'vitest';
import { KEYMAP, route } from './keymap';

const body = { tagName: 'DIV' };
const press = (key: string, over: object = {}) => route({ key, target: body, ...over });

describe('keymap router (FR-KEY-01/02)', () => {
  it('routes the Appendix A single keys, case-insensitively', () => {
    expect(press('j')?.action).toBe('lineDown');
    expect(press('ArrowUp')?.action).toBe('lineUp');
    expect(press('H', { shiftKey: true })?.action).toBe('highlight');
    expect(press('5')).toEqual({ action: 'colour', key: '5' });
    expect(press('b')?.action).toBe('bookmark');
    expect(press('n')?.action).toBe('note');
    expect(press('Backspace')?.action).toBe('remove');
    expect(press(']')?.action).toBe('nextBookmark');
    expect(press('/')?.action).toBe('find');
    expect(press('?', { shiftKey: true })?.action).toBe('help');
    expect(press('9')).toBeNull();
  });

  it('tells T from Shift+T and leaves Shift+arrows / Shift+digits alone', () => {
    expect(press('t')?.action).toBe('themeMenu');
    expect(press('T', { shiftKey: true })?.action).toBe('cycleTheme');
    expect(press('ArrowDown', { shiftKey: true })).toBeNull(); // extend selection is P1 (FR-LIN-05)
    expect(press('!', { shiftKey: true })).toBeNull();
  });

  it('routes Ctrl/Cmd chords: undo, redo, find, zoom', () => {
    expect(press('z', { ctrlKey: true })?.action).toBe('undo');
    expect(press('Z', { metaKey: true, shiftKey: true })?.action).toBe('redo');
    expect(press('f', { ctrlKey: true })?.action).toBe('find');
    expect(press('+', { ctrlKey: true, shiftKey: true })?.action).toBe('zoomIn');
    expect(press('0', { metaKey: true })?.action).toBe('zoomReset');
    expect(press('b', { ctrlKey: true })).toBeNull(); // browser-reserved combos are never bound (H3)
  });

  it('never fires single keys in text fields, during IME composition, or with modifiers (FR-KEY-02)', () => {
    for (const target of [
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'TEXTAREA' },
      { tagName: 'DIV', isContentEditable: true },
    ])
      expect(press('b', { target })).toBeNull();
    expect(press('b', { isComposing: true })).toBeNull();
    expect(press('b', { keyCode: 229 })).toBeNull();
    expect(press('b', { altKey: true })).toBeNull();
    expect(press('z', { ctrlKey: true, altKey: true })).toBeNull(); // AltGr
  });

  it('text fields keep their own undo, but find and zoom chords still work there', () => {
    const target = { tagName: 'TEXTAREA' };
    expect(press('z', { ctrlKey: true, target })).toBeNull();
    expect(press('f', { ctrlKey: true, target })?.action).toBe('find');
  });

  it('binds no modifier-only chord and no key twice', () => {
    const seen = new Set<string>();
    for (const b of KEYMAP)
      for (const k of b.keys) {
        expect(['Control', 'Alt', 'Shift', 'Meta']).not.toContain(k);
        for (const shift of b.shift === undefined ? [true, false] : [b.shift]) {
          const id = `${b.primary ? 'P+' : ''}${shift ? 'S+' : ''}${k}`;
          expect(seen.has(id), id).toBe(false);
          seen.add(id);
        }
      }
  });
});
