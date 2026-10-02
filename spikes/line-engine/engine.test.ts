import { describe, expect, it } from 'vitest';
import { buildPageLines, hitTest, neighborLine, type RawTextItem } from './engine';

const SIZE = { width: 600, height: 800 };
/** Item with its baseline at (x, base) in page units; width ~ 0.5 em per char. */
function item(str: string, x: number, base: number, fs = 10, o: Partial<RawTextItem> & { w?: number } = {}): RawTextItem {
  const w = o.w ?? str.length * fs * 0.5;
  const top = base - 0.8 * fs;
  return {
    str,
    rect: { x: x / SIZE.width, y: top / SIZE.height, w: w / SIZE.width, h: fs / SIZE.height },
    baseline: base / SIZE.height,
    fontSize: fs,
    vertical: false,
    hasEOL: false,
    ...o,
  };
}
const build = (items: RawTextItem[]) => buildPageLines(1, items, SIZE);
const texts = (items: RawTextItem[]) => build(items).lines.map((l) => l.text);

/** A column of `n` full-width (240pt) lines at x: two words, word gaps staggered like real text. */
const column = (x: number, n: number, tag: string, base0 = 100, lead = 12) =>
  Array.from({ length: n }, (_, k) => {
    const w1 = 90 + ((k * 37) % 60);
    return [
      item(`${tag}${k}a`, x, base0 + k * lead, 10, { w: w1 }),
      item(`${tag}${k}b`, x + w1 + 3, base0 + k * lead, 10, { w: 237 - w1 }),
    ];
  }).flat();

describe('buildPageLines', () => {
  it('groups items on a baseline and inserts spaces at word gaps only', () => {
    const items = [item('Hello', 50, 100), item('world', 80, 100), item('again', 50, 112), item('st', 80, 112, 10, { w: 10 }), item('uck', 90, 112)];
    expect(texts(items)).toEqual(['Hello world', 'again stuck']);
  });

  it('keeps two columns apart and reads the left column first', () => {
    const items = [...column(50, 6, 'L'), ...column(330, 6, 'R')];
    const t = texts(items);
    expect(t).toHaveLength(12);
    expect(t.slice(0, 6).every((s) => s.startsWith('L'))).toBe(true);
    expect(t.slice(6).every((s) => s.startsWith('R'))).toBe(true);
  });

  it('cuts a full-width title off before splitting columns', () => {
    const items = [item('A wide title that spans both columns of the page', 60, 60, 14, { w: 480 }), ...column(50, 5, 'L'), ...column(330, 5, 'R')];
    const t = texts(items);
    expect(t[0]).toMatch(/^A wide title/);
    expect(t[1]).toBe('L0a L0b');
    expect(t[6]).toBe('R0a R0b');
  });

  it('joins superscripts and subscripts into their line', () => {
    const items = [item('energy', 50, 100), item('2', 80, 96, 6.5), item('x', 50, 112), item('i', 55, 114.5, 6.5), item('plus', 62, 112)];
    expect(texts(items)).toEqual(['energy2', 'xi plus']);
  });

  it('keeps narrow bullets and table cells on their row (no column cut)', () => {
    const bullets = [0, 1, 2].flatMap((k) => [item('•', 50, 100 + k * 14), item(`item number ${k} text`, 70, 100 + k * 14)]);
    expect(texts(bullets)).toEqual(['• item number 0 text', '• item number 1 text', '• item number 2 text']);
    const table = [0, 1, 2].flatMap((k) => [item('Region', 50, 100 + k * 14), item('12', 200, 100 + k * 14), item('34', 300, 100 + k * 14)]);
    expect(texts(table)).toEqual(['Region 12 34', 'Region 12 34', 'Region 12 34']);
  });

  it('flags soft hyphenation and removes it from textNorm', () => {
    const pl = build([item('under-', 50, 100), item('standing is', 50, 112), item('ﬁne', 50, 124)]);
    expect(pl.lines[0]!.hyphenated).toBe(true);
    expect(pl.lines[1]!.hyphenated).toBe(false);
    expect(pl.textNorm).toBe('understanding is fine');
    expect(pl.text).toBe('under-\nstanding is\nﬁne');
  });

  it('drops a fake-bold double print', () => {
    expect(texts([item('Bold', 50, 100), item('Bold', 50.3, 100)])).toEqual(['Bold']);
  });

  it('reports no text layer for empty or whitespace-only pages', () => {
    expect(build([]).hasTextLayer).toBe(false);
    expect(build([item('   ', 50, 100), item('', 50, 112)]).hasTextLayer).toBe(false);
  });

  it('makes vertical items single-item lines after the body', () => {
    const v = item('arXiv stamp', 20, 400, 12, { vertical: true, rect: { x: 0.02, y: 0.3, w: 0.02, h: 0.3 } });
    const pl = build([...column(50, 3, 'L'), v]);
    expect(pl.lines.at(-1)!.text).toBe('arXiv stamp');
    expect(new Set(pl.lines.map((l) => l.region)).size).toBe(2);
  });

  it('keeps item offsets consistent with the line text', () => {
    const pl = build([item('Hello', 50, 100), item('  world ', 80, 100)]);
    const l = pl.lines[0]!;
    expect(l.text).toBe('Hello world');
    expect(l.items.map((r) => l.text.slice(r.charStart, r.charEnd).trim())).toEqual(['Hello', 'world']);
  });

  it('clamps highlight bands so neighbours never overlap', () => {
    const pl = build(column(50, 4, 'L', 100, 10)); // solid leading: 1.15 em bands would overlap
    for (let k = 1; k < pl.lines.length; k++) {
      const a = pl.lines[k - 1]!.band;
      const b = pl.lines[k]!.band;
      expect(a.y + a.h).toBeLessThanOrEqual(b.y + 1e-9);
    }
  });

  it('never throws on hostile input', () => {
    const bad = [
      item('नमस्ते दुनिया', 50, 100),
      item('中文测试', 50, 112),
      item('rtl שלום', 50, 124),
      { ...item('nan', 50, 136), rect: { x: NaN, y: 0, w: 1, h: 1 } },
      { ...item('neg', 50, 148), fontSize: -1, baseline: Infinity },
    ];
    expect(() => build(bad)).not.toThrow();
    expect(build(bad).lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe('hitTest / neighborLine', () => {
  const pl = build([...column(50, 6, 'L'), ...column(330, 6, 'R')]);
  const at = (x: number, y: number) => hitTest(pl, x / SIZE.width, y / SIZE.height)?.text ?? null;

  it('hits the line under the point, per column', () => {
    expect(at(60, 97)).toBe('L0a L0b');
    expect(at(340, 97 + 24)).toBe('R2a R2b');
  });

  it('snaps clicks in the inter-line gap to the nearest line within pitch/2', () => {
    expect(at(60, 101.5)).toBe('L0a L0b'); // just below line 0's band
    expect(at(60, 104.5)).toBe('L1a L1b'); // nearer line 1
  });

  it('returns null away from text', () => {
    expect(at(60, 400)).toBeNull();
    expect(at(5, 97)).toBeNull();
    expect(hitTest(build([]), 0.5, 0.5)).toBeNull();
  });

  it('walks reading order across columns', () => {
    const last = pl.lines[5]!;
    expect(neighborLine(pl, last, 1)?.text).toBe('R0a R0b');
    expect(neighborLine(pl, pl.lines[0]!, -1)).toBeNull();
  });
});
