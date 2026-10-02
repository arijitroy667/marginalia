/**
 * S1 report: runs the Line Engine over fixtures/pdfs (+ fixtures/pdfs/real if present), scores
 * generated fixtures against truth (F1: normalised text equal AND IoU >= 0.5), measures latency,
 * and dumps predictions for overlay rendering.  Usage: pnpm tsx spikes/line-engine/report.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { buildPageLines, type NRect, type PageLines } from './engine';
import { itemsFromTextContent, type TextContentLike } from './adapter';

const ROOT = resolve(import.meta.dirname, '../..');
const PDFS = join(ROOT, 'fixtures/pdfs');
const OUT = join(import.meta.dirname, 'out');
const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

interface TruthLine { text: string; rect: [number, number, number, number]; score: boolean; tag?: string }
interface Truth { fixture: string; layout: string; pages: { page: number; hasText: boolean; lines: TruthLine[] }[] }

// whitespace-insensitive: F1 measures line boundaries; U+00B7 vs U+2022 is a PyMuPDF WinAnsi artifact
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/gu, '').replaceAll('·', '•');
const iou = (a: NRect, b: NRect) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;

async function loadPages(file: string) {
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    cMapUrl: `${ROOT}/node_modules/pdfjs-dist/cmaps/`.replaceAll('\\', '/'),
    cMapPacked: true,
    standardFontDataUrl: `${ROOT}/node_modules/pdfjs-dist/standard_fonts/`.replaceAll('\\', '/'),
    verbosity: 0,
  }).promise;
  const pages: { n: number; run: () => PageLines; chars: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = (await page.getTextContent()) as TextContentLike;
    const items = itemsFromTextContent(tc, vp);
    const chars = items.reduce((s, it) => s + it.str.length, 0);
    pages.push({ n, chars, run: () => buildPageLines(n, items, { width: vp.width, height: vp.height }) });
  }
  return pages;
}

function timeIt(run: () => PageLines): { pl: PageLines; ms: number } {
  let pl = run();
  const ts: number[] = [];
  for (let k = 0; k < 7; k++) {
    const t0 = performance.now();
    pl = run();
    ts.push(performance.now() - t0);
  }
  return { pl, ms: med(ts) };
}

mkdirSync(join(OUT, 'pred'), { recursive: true });
const groups: Record<string, { tp: number; fp: number; fn: number; ordOk: number; ordN: number }> = {};
const rows: string[] = [];
const latencies: { ms: number; chars: number }[] = [];
const failures: string[] = [];
const misses: string[] = [];

const truthFiles = readdirSync(join(PDFS, 'truth')).filter((f) => f.endsWith('.json') && !f.endsWith('.boxes.json'));
for (const tf of truthFiles) {
  const truth = JSON.parse(readFileSync(join(PDFS, 'truth', tf), 'utf8')) as Truth;
  let pages;
  try {
    pages = await loadPages(join(PDFS, truth.fixture));
  } catch (e) {
    failures.push(`${truth.fixture}: load failed ${String(e)}`);
    continue;
  }
  const g = (groups[truth.layout] ??= { tp: 0, fp: 0, fn: 0, ordOk: 0, ordN: 0 });
  const dump: unknown[] = [];
  let tp = 0, fp = 0, fn = 0;
  for (const p of pages) {
    let res: { pl: PageLines; ms: number };
    try {
      res = timeIt(p.run);
    } catch (e) {
      failures.push(`${truth.fixture} p${p.n}: engine threw ${String(e)}`);
      continue;
    }
    const { pl, ms } = res;
    latencies.push({ ms, chars: p.chars });
    dump.push({ page: p.n, hasTextLayer: pl.hasTextLayer, lines: pl.lines.map((l) => ({ i: l.index, r: l.region, text: l.text, rect: l.rect, band: l.band })) });
    const tp_ = truth.pages.find((t) => t.page === p.n);
    if (!tp_) continue;
    if (!tp_.hasText) {
      if (pl.hasTextLayer) failures.push(`${truth.fixture} p${p.n}: expected hasTextLayer=false`);
      continue;
    }
    if (truth.layout === 'nonlatin') continue; // no-crash only
    const tl = tp_.lines.map((t) => ({ ...t, r: { x: t.rect[0], y: t.rect[1], w: t.rect[2], h: t.rect[3] } }));
    const used = new Set<number>();
    const matchOf: number[] = [];
    // unscored truth lines absorb overlapping predictions (not counted as FP)
    for (const t of tl.filter((t) => !t.score))
      pl.lines.forEach((l) => iou(l.rect, t.r) >= 0.3 && used.add(l.index));
    for (const t of tl.filter((t) => t.score)) {
      let best = -1, bestIou = 0.5;
      for (const l of pl.lines) {
        if (used.has(l.index) || norm(l.text) !== norm(t.text)) continue;
        const v = iou(l.rect, t.r);
        if (v >= bestIou) { bestIou = v; best = l.index; }
      }
      if (best >= 0) { used.add(best); tp++; matchOf.push(best); }
      else {
        fn++;
        const near = pl.lines.reduce((b, l) => (iou(l.rect, t.r) > iou(b?.rect ?? l.rect, t.r) ? l : b), pl.lines[0]);
        misses.push(`${truth.fixture} p${p.n} MISS "${t.text.slice(0, 60)}"\n      got "${near?.text.slice(0, 60)}"`);
      }
    }
    fp += pl.lines.filter((l) => !used.has(l.index)).length;
    for (let k = 1; k < matchOf.length; k++) { g.ordN++; if (matchOf[k]! > matchOf[k - 1]!) g.ordOk++; }
  }
  writeFileSync(join(OUT, 'pred', truth.fixture.replace('.pdf', '.json')), JSON.stringify({ fixture: truth.fixture, pages: dump }));
  g.tp += tp; g.fp += fp; g.fn += fn;
  const P = tp / (tp + fp || 1), R = tp / (tp + fn || 1);
  rows.push(`| ${truth.fixture} | ${truth.layout} | ${tp + fn} | ${tp + fp} | ${P.toFixed(3)} | ${R.toFixed(3)} | ${((2 * P * R) / (P + R || 1)).toFixed(3)} |`);
}

// real corpus: predictions only (overlays for human review)
const realDir = join(PDFS, 'real');
if (existsSync(realDir)) {
  for (const f of readdirSync(realDir).filter((f) => f.endsWith('.pdf'))) {
    try {
      const pages = await loadPages(join(realDir, f));
      const dump = pages.map((p) => {
        const { pl, ms } = timeIt(p.run);
        latencies.push({ ms, chars: p.chars });
        return { page: p.n, hasTextLayer: pl.hasTextLayer, lines: pl.lines.map((l) => ({ i: l.index, r: l.region, text: l.text, rect: l.rect, band: l.band })) };
      });
      writeFileSync(join(OUT, 'pred', 'real-' + f.replace('.pdf', '.json')), JSON.stringify({ fixture: 'real/' + f, pages: dump }));
    } catch (e) {
      failures.push(`real/${f}: ${String(e)}`);
    }
  }
}

const f1 = (k: string) => {
  const g = groups[k];
  if (!g) return NaN;
  const P = g.tp / (g.tp + g.fp || 1), R = g.tp / (g.tp + g.fn || 1);
  return (2 * P * R) / (P + R || 1);
};
const dense = latencies.filter((l) => l.chars >= 1500);
const per3k = dense.map((l) => (l.ms * 3000) / l.chars);
const lines = [
  '# S1 Line Engine report',
  '',
  '| fixture | layout | truth | pred | P | R | F1 |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '| group | F1 | reading-order accuracy |',
  '|---|---|---|',
  ...Object.entries(groups).map(([k, g]) => `| ${k} | ${f1(k).toFixed(3)} | ${(g.ordOk / (g.ordN || 1)).toFixed(3)} |`),
  '',
  `Latency: median ${med(latencies.map((l) => l.ms)).toFixed(2)} ms/page over ${latencies.length} pages; ` +
    `median ${med(per3k).toFixed(2)} ms per 3,000 chars (pages >= 1,500 chars, n=${dense.length}); max ${Math.max(...latencies.map((l) => l.ms)).toFixed(2)} ms`,
  '',
  `Gate: single F1 ${f1('single').toFixed(3)} (>= 0.97) | two-column F1 ${f1('two-column').toFixed(3)} (>= 0.92) | ` +
    `latency ${med(per3k).toFixed(2)} ms (< 30) | failures ${failures.length}`,
  ...failures.map((f) => `- FAIL ${f}`),
];
writeFileSync(join(OUT, 'report.md'), lines.join('\n') + '\n\n## Misses\n\n```\n' + misses.join('\n') + '\n```\n');
console.log(lines.join('\n'));
console.log(`\n${misses.length} misses (see spikes/line-engine/out/report.md)`);
