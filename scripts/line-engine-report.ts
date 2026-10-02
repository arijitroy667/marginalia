/**
 * Line Engine report (ADR 0001): F1 per layout group against generated truth, latency, and prediction dumps
 * for PNG overlays (scripts/line-overlay.py), including the real-world corpus (fixtures/pdfs/real, optional).
 * The CI gate is src/features/reader/lines/corpus.test.ts; this script is for tuning.
 * Usage: pnpm tsx scripts/line-engine-report.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPageLines, type PageLines } from '../src/core/line-engine';
import { itemsFromTextContent } from '../src/features/reader/lines/textItems';
import { f1, scorePage, type Score, type Truth } from './line-score';

const ROOT = resolve(import.meta.dirname, '..');
const PDFS = join(ROOT, 'fixtures/pdfs');
const OUT = join(ROOT, 'test-results', 'line-engine');
const asset = (dir: string) => `${ROOT}/node_modules/pdfjs-dist/${dir}/`.split('\\').join('/');
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;

async function run(file: string): Promise<{ pl: PageLines; ms: number; chars: number }[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'), verbosity: 0 }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const items = itemsFromTextContent(await page.getTextContent(), vp);
    const build = () => buildPageLines(n, items, { width: vp.width, height: vp.height });
    const times: number[] = [];
    let pl = build();
    for (let k = 0; k < 7; k++) {
      const t0 = performance.now();
      pl = build();
      times.push(performance.now() - t0);
    }
    out.push({ pl, ms: median(times), chars: items.reduce((s, it) => s + it.str.length, 0) });
  }
  await doc.loadingTask.destroy();
  return out;
}

const dump = (name: string, pages: { pl: PageLines }[]) =>
  writeFileSync(
    join(OUT, 'pred', name),
    JSON.stringify({ fixture: name, pages: pages.map(({ pl }) => ({ page: pl.page, hasTextLayer: pl.hasTextLayer, lines: pl.lines.map((l) => ({ i: l.index, r: l.region, text: l.text, rect: l.rect, band: l.band })) })) }),
  );

mkdirSync(join(OUT, 'pred'), { recursive: true });
const groups: Record<string, Score> = {};
const rows: string[] = [];
const latencies: { ms: number; chars: number }[] = [];
const misses: string[] = [];

for (const f of readdirSync(join(PDFS, 'truth')).filter((f) => f.endsWith('.json') && !f.endsWith('.boxes.json'))) {
  const truth = JSON.parse(readFileSync(join(PDFS, 'truth', f), 'utf8')) as Truth;
  const pages = await run(join(PDFS, truth.fixture));
  latencies.push(...pages);
  dump(f, pages);
  const s: Score = { tp: 0, fp: 0, fn: 0, orderOk: 0, orderN: 0 };
  for (const { pl } of pages) {
    const t = truth.pages.find((p) => p.page === pl.page);
    if (!t?.hasText || truth.layout === 'nonlatin') continue;
    const m: string[] = [];
    const ps = scorePage(t, pl, m);
    misses.push(...m.map((x) => `${truth.fixture} ${x}`));
    (Object.keys(s) as (keyof Score)[]).forEach((k) => (s[k] += ps[k]));
  }
  const g = (groups[truth.layout] ??= { tp: 0, fp: 0, fn: 0, orderOk: 0, orderN: 0 });
  (Object.keys(s) as (keyof Score)[]).forEach((k) => (g[k] += s[k]));
  rows.push(`| ${truth.fixture} | ${truth.layout} | ${s.tp + s.fn} | ${s.tp + s.fp} | ${f1(s).toFixed(3)} |`);
}

const realDir = join(PDFS, 'real');
if (existsSync(realDir))
  for (const f of readdirSync(realDir).filter((f) => f.endsWith('.pdf'))) {
    const pages = await run(join(realDir, f));
    latencies.push(...pages);
    dump(`real-${f.replace('.pdf', '.json')}`, pages);
  }

const dense = latencies.filter((l) => l.chars >= 1500).map((l) => (l.ms * 3000) / l.chars);
const report = [
  '| fixture | layout | truth | pred | F1 |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  ...Object.entries(groups).map(([k, g]) => `${k}: F1 ${f1(g).toFixed(3)}, reading order ${(g.orderOk / (g.orderN || 1)).toFixed(3)}`),
  `latency: median ${median(dense).toFixed(2)} ms per 3,000 chars over ${dense.length} dense pages (${latencies.length} pages total)`,
].join('\n');
writeFileSync(join(OUT, 'report.md'), `${report}\n\n## Misses\n\n${misses.join('\n')}\n`);
console.log(report);
