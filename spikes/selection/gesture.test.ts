import { describe, expect, it } from 'vitest';
import { classifyPointer, groupLineRects } from './gesture';

const at = (x: number, y: number, t: number) => ({ x, y, t });

describe('classifyPointer', () => {
  it('mouse: < 4 px and < 300 ms is a tap', () => {
    expect(classifyPointer('mouse', at(0, 0, 0), at(3, 0, 120))).toBe('tap');
    expect(classifyPointer('mouse', at(0, 0, 0), at(4, 0, 120))).toBe('native');
    expect(classifyPointer('mouse', at(0, 0, 0), at(0, 0, 300))).toBe('native');
  });

  it('touch allows 10 px of slop', () => {
    expect(classifyPointer('touch', at(0, 0, 0), at(6, 7, 200))).toBe('tap');
    expect(classifyPointer('touch', at(0, 0, 0), at(8, 7, 200))).toBe('native');
  });

  it('double click is native word selection', () => {
    expect(classifyPointer('mouse', at(0, 0, 0), at(0, 0, 80), 0, 2)).toBe('native');
  });

  it('long-press and wander-and-return are native', () => {
    expect(classifyPointer('touch', at(0, 0, 0), at(0, 0, 450))).toBe('native');
    expect(classifyPointer('mouse', at(0, 0, 0), at(1, 0, 150), 30)).toBe('native');
  });
});

describe('groupLineRects', () => {
  it('merges spans on one line and keeps lines apart', () => {
    const r = (x: number, y: number, w: number, h = 0.02) => ({ x, y, w, h });
    const out = groupLineRects([r(0.1, 0.1, 0.2), r(0.31, 0.101, 0.3), r(0.1, 0.13, 0.5), r(0.1, 0.16, 0.25), r(0.4, 0.4, 0, 0)]);
    expect(out).toHaveLength(3);
    expect(out[0]!.x).toBeCloseTo(0.1);
    expect(out[0]!.w).toBeCloseTo(0.51);
    expect(out[0]!.h).toBeCloseTo(0.021);
    expect(out.map((l) => l.y)).toEqual([0.1, 0.13, 0.16]);
  });

  it('keeps superscript spans on their line', () => {
    const out = groupLineRects([{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }, { x: 0.3, y: 0.095, w: 0.01, h: 0.012 }]);
    expect(out).toHaveLength(1);
  });
});
