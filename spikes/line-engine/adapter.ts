/**
 * PDF.js TextContent -> RawTextItem[] (canonical viewport: page.getViewport({ scale: 1 })).
 * Geometry mirrors the PDF.js TextLayer span box: top = baseline - ascentRatio * fontHeight,
 * height = fontHeight, but the ascent comes from the textContent style (deterministic, no canvas).
 */
import type { RawTextItem } from './engine';

type Matrix = number[];
interface TextItemLike {
  str: string;
  transform: Matrix;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}
interface StyleLike {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}
export interface TextContentLike {
  items: (TextItemLike | { type: string })[];
  styles: Record<string, StyleLike>;
}
export interface ViewportLike {
  transform: Matrix;
  width: number;
  height: number;
  scale: number;
}

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0]! * n[0]! + m[2]! * n[1]!,
  m[1]! * n[0]! + m[3]! * n[1]!,
  m[0]! * n[2]! + m[2]! * n[3]!,
  m[1]! * n[2]! + m[3]! * n[3]!,
  m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
  m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
];

export function ascentRatio(s: StyleLike | undefined): number {
  const a = s?.ascent;
  const d = s?.descent;
  const r = a && d ? a / (a - d) : a ? a : d ? 1 + d : 0.8;
  return Math.min(1, Math.max(0.5, r));
}

export function itemsFromTextContent(tc: TextContentLike, vp: ViewportLike): RawTextItem[] {
  const W = vp.width;
  const H = vp.height;
  const out: RawTextItem[] = [];
  for (const raw of tc.items) {
    if (!('str' in raw)) continue; // marked-content markers
    const st = tc.styles[raw.fontName];
    const m = mul(vp.transform, raw.transform);
    const fh = Math.hypot(m[2]!, m[3]!);
    const asc = ascentRatio(st);
    const len = (st?.vertical ? raw.height : raw.width) * vp.scale;
    let angle = Math.atan2(m[1]!, m[0]!);
    if (st?.vertical) angle += Math.PI / 2;
    const horizontal = Math.abs(angle) < 0.05;
    let x0: number, y0: number, x1: number, y1: number, baseline: number;
    if (horizontal) {
      x0 = m[4]!;
      x1 = x0 + len;
      baseline = m[5]!;
      y0 = baseline - asc * fh;
      y1 = y0 + fh;
    } else {
      // rotated text: axis-aligned bounds of the rotated box
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const vx = uy; // glyph "up" in y-down space is u rotated -90deg
      const vy = -ux;
      const pts: [number, number][] = [];
      for (const s of [0, len])
        for (const t of [asc * fh, (asc - 1) * fh]) pts.push([m[4]! + ux * s + vx * t, m[5]! + uy * s + vy * t]);
      x0 = Math.min(...pts.map((p) => p[0]));
      x1 = Math.max(...pts.map((p) => p[0]));
      y0 = Math.min(...pts.map((p) => p[1]));
      y1 = Math.max(...pts.map((p) => p[1]));
      baseline = (y0 + y1) / 2;
    }
    out.push({
      str: raw.str,
      rect: { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H },
      baseline: baseline / H,
      fontSize: fh / vp.scale,
      vertical: !horizontal,
      hasEOL: raw.hasEOL,
    });
  }
  return out;
}
