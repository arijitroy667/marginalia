/**
 * Tap-vs-drag classification (FR-LIN-02, ADR 0004). Pure: fed pointer down/up samples.
 * travel < 4 px (mouse/pen) or < 10 px (touch) AND duration < 300 ms => 'tap' (line select);
 * anything else is left to native text selection ('native'). A touch held >= 300 ms is a long-press
 * (native word selection), also 'native'.
 */
export type PointerKind = 'mouse' | 'pen' | 'touch';
export interface PointerSample { x: number; y: number; t: number }

export const TAP_MAX_MS = 300;
export const TAP_SLOP_PX: Record<PointerKind, number> = { mouse: 4, pen: 4, touch: 10 };

/** `clicks` = PointerEvent.detail: a double/triple click is the browser's word/line selection, never a tap. */
export function classifyPointer(kind: PointerKind, down: PointerSample, up: PointerSample, maxTravel = 0, clicks = 1): 'tap' | 'native' {
  const travel = Math.max(maxTravel, Math.hypot(up.x - down.x, up.y - down.y));
  return clicks < 2 && travel < TAP_SLOP_PX[kind] && up.t - down.t < TAP_MAX_MS ? 'tap' : 'native';
}

/** Normalised rect in page space (0..1). */
export interface NRect { x: number; y: number; w: number; h: number }

/**
 * Merge per-span client rects of a selection into one rect per visual line (FR-LIN-04).
 * Input rects must already be in canonical page space (un-rotated); rects overlapping vertically by
 * >= 50 % of the smaller height belong to the same line (same rule as the Line Engine, so
 * super/subscripts stay on their line). Output keeps reading order.
 */
export function groupLineRects(rects: NRect[]): NRect[] {
  const lines: NRect[] = [];
  for (const r of rects.filter((r) => r.w > 0 && r.h > 0)) {
    const overlap = (l: NRect) => (Math.min(l.y + l.h, r.y + r.h) - Math.max(l.y, r.y)) / Math.min(l.h, r.h);
    const line = lines.find((l) => overlap(l) >= 0.5);
    if (!line) {
      lines.push({ ...r });
      continue;
    }
    const x0 = Math.min(line.x, r.x), y0 = Math.min(line.y, r.y);
    line.w = Math.max(line.x + line.w, r.x + r.w) - x0;
    line.h = Math.max(line.y + line.h, r.y + r.h) - y0;
    line.x = x0;
    line.y = y0;
  }
  return lines;
}
