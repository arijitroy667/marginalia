/** Line-boundary scoring shared by the CI gate and the S1 report (ADR 0001). */
import type { NRect, PageLines } from '../src/core/line-engine';

export interface TruthLine {
  text: string;
  rect: [number, number, number, number];
  score: boolean;
  tag?: string;
}
export interface TruthPage {
  page: number;
  hasText: boolean;
  lines: TruthLine[];
}
export interface Truth {
  fixture: string;
  layout: string;
  pages: TruthPage[];
}
export interface Score {
  tp: number;
  fp: number;
  fn: number;
  orderOk: number;
  orderN: number;
}

// whitespace-insensitive: F1 measures line boundaries; U+00B7 vs U+2022 is a PyMuPDF WinAnsi artifact
export const normText = (s: string) => s.normalize('NFKC').replace(/\s+/gu, '').replaceAll('·', '•');

export function iou(a: NRect, b: NRect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

/** A predicted line matches a scored truth line if normalised text is equal AND IoU >= 0.5. */
export function scorePage(truth: TruthPage, pl: PageLines, misses: string[] = []): Score {
  const tl = truth.lines.map((t) => ({ ...t, r: { x: t.rect[0], y: t.rect[1], w: t.rect[2], h: t.rect[3] } }));
  const used = new Set<number>();
  // unscored truth lines absorb overlapping predictions (not counted as false positives)
  for (const t of tl.filter((t) => !t.score)) for (const l of pl.lines) if (iou(l.rect, t.r) >= 0.3) used.add(l.index);
  const matched: number[] = [];
  let tp = 0;
  let fn = 0;
  for (const t of tl.filter((t) => t.score)) {
    let best = -1;
    let bestIou = 0.5;
    for (const l of pl.lines) {
      if (used.has(l.index) || normText(l.text) !== normText(t.text)) continue;
      const v = iou(l.rect, t.r);
      if (v >= bestIou) {
        bestIou = v;
        best = l.index;
      }
    }
    if (best >= 0) {
      used.add(best);
      tp++;
      matched.push(best);
    } else {
      fn++;
      misses.push(`p${truth.page} "${t.text.slice(0, 60)}"`);
    }
  }
  let orderOk = 0;
  for (let k = 1; k < matched.length; k++) if (matched[k]! > matched[k - 1]!) orderOk++;
  return { tp, fp: pl.lines.filter((l) => !used.has(l.index)).length, fn, orderOk, orderN: Math.max(0, matched.length - 1) };
}

export function f1(s: Pick<Score, 'tp' | 'fp' | 'fn'>): number {
  const p = s.tp / (s.tp + s.fp || 1);
  const r = s.tp / (s.tp + s.fn || 1);
  return (2 * p * r) / (p + r || 1);
}
