/**
 * Line Engine (spike S1, PRD §8.5). Pure TypeScript: no DOM, React, Supabase or PDF.js types.
 * Reconstructs visual text lines from positioned text items:
 *   1. drop whitespace-only items (geometry), vertical items become single-item lines
 *   2. regions by recursive XY-cut -- column (vertical) cuts are tried before band
 *      (horizontal) cuts so two-column text keeps its reading order (ADR 0001)
 *   3. lines inside a region by baseline proximity or vertical overlap (super/subscripts)
 *   4. text join with gap-based spaces, 5. hyphenation, 6. rect/pitch, 7. highlight band.
 */

export const ENGINE_VERSION = 1;

export interface NRect { x: number; y: number; w: number; h: number } // 0..1, canonical page space, top-left

export interface RawTextItem {
  str: string;
  rect: NRect; // already normalised by the adapter
  baseline: number; // normalised y of the baseline (horizontal text)
  fontSize: number; // canonical page units (1/72 in)
  vertical: boolean; // true if not horizontal left-to-right text
  hasEOL: boolean;
}

export interface PageSize { width: number; height: number } // canonical page units

export interface Line {
  page: number; // 1-based
  index: number; // reading order within page (volatile: depends on ENGINE_VERSION)
  region: number; // XY-cut leaf id
  text: string;
  rect: NRect; // union of item rects
  band: NRect; // highlight geometry: 1.15 x font size on the text body, clamped between neighbours
  pitch: number; // distance to the next baseline in the region (normalised y)
  items: { itemIndex: number; charStart: number; charEnd: number; rect: NRect }[];
  hyphenated: boolean;
}

export interface PageLines {
  engineVersion: number;
  page: number;
  lines: Line[];
  text: string; // lines joined with '\n'
  textNorm: string; // NFKC, collapsed whitespace, de-hyphenated
  hasTextLayer: boolean;
}

export interface LineEngineConfig {
  yCutGap: number; // band cut: min empty horizontal strip, x median font size
  xCutGap: number; // column cut: min empty vertical strip, x median font size
  minColWidth: number; // each side of a column cut must be at least this wide, x font size
  baselineTol: number; // join if |baseline delta| <= this x line font size
  overlapJoin: number; // ... or vertical overlap ratio >= this (super/subscripts)
  wordGap: number; // insert a space when the gap > this x font size
  pitchFallback: number; // pitch for the last line of a region, x font size
  bandHeight: number; // highlight band height, x font size
}

export const LINE_ENGINE_CONFIG: LineEngineConfig = {
  yCutGap: 1.0,
  xCutGap: 1.0,
  minColWidth: 4,
  baselineTol: 0.3,
  overlapJoin: 0.5,
  wordGap: 0.15,
  pitchFallback: 1.2,
  bandHeight: 1.15,
};

// ---------------------------------------------------------------------------------------------
// internals work in canonical page units (pt), y down

interface It {
  i: number;
  str: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  base: number;
  fs: number;
}

interface Group {
  items: It[];
  base: number; // baseline of the dominant (largest) item
  fs: number;
  y0: number; // dominant item box
  y1: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

/** Column cut: empty vertical strips >= xCutGap em, every side >= minColWidth em, >= 2 rows. */
function splitColumns(set: It[], fs: number, c: LineEngineConfig): It[][] | null {
  const bases = set.map((t) => t.base).sort((a, b) => a - b);
  let rows = 1;
  for (let k = 1; k < bases.length; k++) if (bases[k]! - bases[k - 1]! > 0.5 * fs) rows++;
  if (rows < 2) return null;

  const byX = [...set].sort((a, b) => a.x0 - b.x0);
  const segs: It[][] = [[]];
  let maxX1 = -Infinity;
  for (const t of byX) {
    if (maxX1 !== -Infinity && t.x0 - maxX1 >= c.xCutGap * fs) segs.push([]);
    segs[segs.length - 1]!.push(t);
    maxX1 = Math.max(maxX1, t.x1);
  }
  if (segs.length < 2) return null;

  // Only wide segments are columns. Narrow ones (bullets, line numbers, table cells) join the
  // nearest wide neighbour, so tables of narrow cells stay whole rows (ADR 0001).
  const x0 = (g: It[]) => Math.min(...g.map((t) => t.x0));
  const x1 = (g: It[]) => Math.max(...g.map((t) => t.x1));
  const wide = segs.map((g) => x1(g) - x0(g) >= c.minColWidth * fs);
  if (wide.filter(Boolean).length < 2) return null;
  const groups: It[][] = segs.map((g, k) => (wide[k] ? [...g] : []));
  segs.forEach((g, k) => {
    if (wide[k]) return;
    let l = k - 1;
    let r = k + 1;
    while (l >= 0 && !wide[l]) l--;
    while (r < segs.length && !wide[r]) r++;
    const dl = l >= 0 ? x0(g) - x1(segs[l]!) : Infinity;
    const dr = r < segs.length ? x0(segs[r]!) - x1(g) : Infinity;
    groups[dl <= dr ? l : r]!.push(...g);
  });
  return groups.filter((g) => g.length);
}

/** Band cut at the single widest empty horizontal strip >= yCutGap em. */
function splitBand(set: It[], fs: number, c: LineEngineConfig): It[][] | null {
  const byY = [...set].sort((a, b) => a.y0 - b.y0);
  let maxY1 = -Infinity;
  let best = -1;
  let bestGap = c.yCutGap * fs;
  byY.forEach((t, k) => {
    if (k > 0 && t.y0 - maxY1 >= bestGap) {
      bestGap = t.y0 - maxY1;
      best = k;
    }
    maxY1 = Math.max(maxY1, t.y1);
  });
  return best > 0 ? [byY.slice(0, best), byY.slice(best)] : null;
}

function xyCut(items: It[], c: LineEngineConfig): It[][] {
  const leaves: It[][] = [];
  const rec = (set: It[]): void => {
    if (set.length > 1) {
      const fs = median(set.map((t) => t.fs));
      const parts = splitColumns(set, fs, c) ?? splitBand(set, fs, c);
      if (parts) return parts.forEach(rec);
    }
    leaves.push(set);
  };
  rec(items);
  return leaves;
}

function groupLines(set: It[], c: LineEngineConfig): It[][] {
  const sorted = [...set].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const groups: Group[] = [];
  for (const t of sorted) {
    let target: Group | undefined;
    for (let k = groups.length - 1; k >= Math.max(0, groups.length - 3); k--) {
      const g = groups[k]!;
      const overlap = Math.min(t.y1, g.y1) - Math.max(t.y0, g.y0);
      const ratio = overlap / Math.max(1e-9, Math.min(t.y1 - t.y0, g.y1 - g.y0));
      if (Math.abs(t.base - g.base) <= c.baselineTol * g.fs || ratio >= c.overlapJoin) {
        target = g;
        break;
      }
    }
    if (!target) {
      groups.push({ items: [t], base: t.base, fs: t.fs, y0: t.y0, y1: t.y1 });
      continue;
    }
    target.items.push(t);
    if (t.fs > target.fs) Object.assign(target, { base: t.base, fs: t.fs, y0: t.y0, y1: t.y1 });
  }
  return groups.sort((a, b) => a.base - b.base).map((g) => g.items.sort((a, b) => a.x0 - b.x0));
}

interface Draft {
  region: number;
  text: string;
  refs: { itemIndex: number; charStart: number; charEnd: number; it: It }[];
  base: number;
  fs: number;
  cy: number; // text-body centre
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function draftLine(items: It[], region: number, c: LineEngineConfig): Draft {
  let text = '';
  const refs: Draft['refs'] = [];
  let prev: It | undefined;
  let dom = items[0]!;
  for (const t of items) {
    if (prev && t.str === prev.str && Math.abs(t.x0 - prev.x0) < 0.25 * t.fs) continue; // fake-bold double print
    if (t.fs > dom.fs) dom = t;
    if (prev && t.x0 - prev.x1 > c.wordGap * Math.min(prev.fs, t.fs) && text && !text.endsWith(' ')) text += ' ';
    const start = text.length;
    for (const ch of t.str) {
      if (/\s/u.test(ch)) {
        if (text && !text.endsWith(' ')) text += ' ';
      } else text += ch;
    }
    refs.push({ itemIndex: t.i, charStart: start, charEnd: text.length, it: t });
    prev = t;
  }
  text = text.trimEnd();
  for (const r of refs) r.charEnd = Math.min(r.charEnd, text.length);
  return {
    region,
    text,
    refs,
    base: dom.base,
    fs: dom.fs,
    cy: (dom.y0 + dom.y1) / 2,
    x0: Math.min(...items.map((t) => t.x0)),
    x1: Math.max(...items.map((t) => t.x1)),
    y0: Math.min(...items.map((t) => t.y0)),
    y1: Math.max(...items.map((t) => t.y1)),
  };
}

export function buildPageLines(
  page: number,
  items: RawTextItem[],
  size: PageSize,
  cfg: Partial<LineEngineConfig> = {},
): PageLines {
  const c = { ...LINE_ENGINE_CONFIG, ...cfg };
  const W = size.width > 0 ? size.width : 1;
  const H = size.height > 0 ? size.height : 1;
  const finite = (r: NRect) => [r.x, r.y, r.w, r.h].every(Number.isFinite);

  const horiz: It[] = [];
  const vert: It[] = [];
  items.forEach((r, i) => {
    if (!r.str.trim() || !finite(r.rect)) return;
    const it: It = {
      i,
      str: r.str,
      x0: r.rect.x * W,
      x1: (r.rect.x + Math.max(0, r.rect.w)) * W,
      y0: r.rect.y * H,
      y1: (r.rect.y + Math.max(0, r.rect.h)) * H,
      base: Number.isFinite(r.baseline) ? r.baseline * H : (r.rect.y + r.rect.h) * H,
      fs: r.fontSize > 0 ? r.fontSize : Math.max(1e-3, r.rect.h * H),
    };
    (r.vertical ? vert : horiz).push(it);
  });

  const empty: PageLines = { engineVersion: ENGINE_VERSION, page, lines: [], text: '', textNorm: '', hasTextLayer: false };
  if (!horiz.length && !vert.length) return empty;

  const drafts: Draft[] = [];
  const leaves = horiz.length ? xyCut(horiz, c) : [];
  leaves.forEach((leaf, region) => {
    for (const g of groupLines(leaf, c)) drafts.push(draftLine(g, region, c));
  });
  vert.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0).forEach((t, k) => drafts.push(draftLine([t], leaves.length + k, c)));

  const nr = (x0: number, y0: number, x1: number, y1: number): NRect => ({
    x: x0 / W,
    y: y0 / H,
    w: (x1 - x0) / W,
    h: (y1 - y0) / H,
  });

  const lines: Line[] = drafts.map((d, index) => {
    const next = drafts[index + 1]?.region === d.region ? drafts[index + 1] : undefined;
    const prev = drafts[index - 1]?.region === d.region ? drafts[index - 1] : undefined;
    const half = (c.bandHeight * d.fs) / 2;
    const top = Math.max(d.cy - half, prev ? (prev.cy + d.cy) / 2 : -Infinity);
    const bottom = Math.min(d.cy + half, next ? (d.cy + next.cy) / 2 : Infinity);
    const pitch = next && next.base > d.base ? next.base - d.base : c.pitchFallback * d.fs;
    const hyphenated = /\p{L}-$/u.test(d.text) && !!next && /^\p{Ll}/u.test(next.text);
    return {
      page,
      index,
      region: d.region,
      text: d.text,
      rect: nr(d.x0, d.y0, d.x1, d.y1),
      band: nr(d.x0, top, d.x1, bottom),
      pitch: pitch / H,
      items: d.refs.map((r) => ({
        itemIndex: r.itemIndex,
        charStart: r.charStart,
        charEnd: r.charEnd,
        rect: nr(r.it.x0, r.it.y0, r.it.x1, r.it.y1),
      })),
      hyphenated,
    };
  });

  let norm = '';
  for (const l of lines) norm += l.hyphenated ? l.text.slice(0, -1) : l.text + ' ';
  return {
    engineVersion: ENGINE_VERSION,
    page,
    lines,
    text: lines.map((l) => l.text).join('\n'),
    textNorm: norm.normalize('NFKC').replace(/\s+/gu, ' ').trim(),
    hasTextLayer: true,
  };
}

// ---------------------------------------------------------------------------------------------
// hit testing: per-region index, binary search by band centre (O(log n) per region)

interface RegionIndex {
  x0: number;
  x1: number;
  lines: Line[];
}
const indexCache = new WeakMap<PageLines, RegionIndex[]>();

function regionIndex(pl: PageLines): RegionIndex[] {
  let idx = indexCache.get(pl);
  if (!idx) {
    const byRegion = new Map<number, Line[]>();
    for (const l of pl.lines) byRegion.set(l.region, [...(byRegion.get(l.region) ?? []), l]);
    idx = [...byRegion.values()].map((ls) => ({
      x0: Math.min(...ls.map((l) => l.rect.x)),
      x1: Math.max(...ls.map((l) => l.rect.x + l.rect.w)),
      lines: ls.sort((a, b) => a.band.y + a.band.h / 2 - (b.band.y + b.band.h / 2)),
    }));
    indexCache.set(pl, idx);
  }
  return idx;
}

const HIT_X_TOL = 0.01;

/** Line under a normalised point; clicks in inter-line gaps snap to the nearest line within pitch/2. */
export function hitTest(pl: PageLines, nx: number, ny: number): Line | null {
  if (!pl.hasTextLayer || !Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  let best: Line | null = null;
  let bestD = Infinity;
  for (const r of regionIndex(pl)) {
    if (nx < r.x0 - HIT_X_TOL || nx > r.x1 + HIT_X_TOL) continue;
    const cy = (l: Line) => l.band.y + l.band.h / 2;
    let lo = 0;
    let hi = r.lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cy(r.lines[mid]!) < ny) lo = mid + 1;
      else hi = mid;
    }
    for (const l of [r.lines[lo - 1], r.lines[lo]]) {
      if (!l) continue;
      const d = Math.abs(ny - cy(l));
      const inside = ny >= l.band.y && ny <= l.band.y + l.band.h;
      if ((inside || d <= l.pitch / 2) && d < bestD) {
        best = l;
        bestD = d;
      }
    }
  }
  return best;
}

/** Next/previous line in reading order on the same page (callers cross pages). */
export function neighborLine(pl: PageLines, line: Line, dir: 1 | -1): Line | null {
  return pl.lines[line.index + dir] ?? null;
}
