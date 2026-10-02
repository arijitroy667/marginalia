import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromCanonical, normalize, normRotation, toCanonical } from './geometry';
import type { NRect } from './types';

const rect = fc
  .record({ x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.double({ min: 0, max: 1, noNaN: true }), w: fc.double({ min: 0, max: 1, noNaN: true }), h: fc.double({ min: 0, max: 1, noNaN: true }) })
  .map((r) => ({ ...r, w: Math.min(r.w, 1 - r.x), h: Math.min(r.h, 1 - r.y) }));
const rotation = fc.constantFrom(0, 90, 180, 270, -90, 450);
const close = (a: NRect, b: NRect) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)) < 1e-12;

describe('geometry (PRD §8.6, §12)', () => {
  it('fromCanonical(toCanonical(r)) == r for every rotation', () => {
    fc.assert(fc.property(rect, rotation, (r, rot) => close(fromCanonical(toCanonical(r, rot), rot), r)));
    fc.assert(fc.property(rect, rotation, (r, rot) => close(toCanonical(fromCanonical(r, rot), rot), r)));
  });

  it('stays inside the unit page and preserves area', () => {
    fc.assert(
      fc.property(rect, rotation, (r, rot) => {
        const d = fromCanonical(r, rot);
        return d.x >= -1e-12 && d.y >= -1e-12 && d.x + d.w <= 1 + 1e-12 && d.y + d.h <= 1 + 1e-12 && Math.abs(d.w * d.h - r.w * r.h) < 1e-12;
      }),
    );
  });

  it('four quarter turns are the identity; 180 is its own inverse', () => {
    fc.assert(fc.property(rect, (r) => close(fromCanonical(fromCanonical(fromCanonical(fromCanonical(r, 90), 90), 90), 90), r)));
    fc.assert(fc.property(rect, (r) => close(fromCanonical(fromCanonical(r, 180), 180), r)));
  });

  it('maps corners as a clockwise rotation (canonical top-left -> displayed top-right at 90)', () => {
    expect(fromCanonical({ x: 0, y: 0, w: 0.1, h: 0.2 }, 90)).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.1 });
    expect(fromCanonical({ x: 0, y: 0, w: 0.1, h: 0.2 }, 270)).toEqual({ x: 0, y: 0.9, w: 0.2, h: 0.1 });
  });

  it('normalisation is zoom-independent (aspect ratios and scales)', () => {
    fc.assert(
      fc.property(rect, fc.double({ min: 50, max: 5000, noNaN: true }), fc.double({ min: 50, max: 5000, noNaN: true }), fc.double({ min: 0.25, max: 8, noNaN: true }), (r, W, H, zoom) => {
        const px = { left: r.x * W * zoom, top: r.y * H * zoom, width: r.w * W * zoom, height: r.h * H * zoom };
        return close(normalize(px, { width: W * zoom, height: H * zoom }), r);
      }),
    );
  });

  it('normalises any multiple of 90 degrees', () => {
    expect([0, 90, 180, 270, 360, -90, 450, 89.9].map(normRotation)).toEqual([0, 90, 180, 270, 0, 270, 90, 90]);
  });
});
