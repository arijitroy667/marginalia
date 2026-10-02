/**
 * Line Engine regression gate (T-200, PRD §12): the S1 F1 thresholds on the generated corpus, the scanned and
 * non-Latin guarantees, and per-page goldens. A golden diff means segmentation changed: review it, bump
 * ENGINE_VERSION (stored annotations keep their rects; only new selections change) and run `vitest -u`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { f1, scorePage, type Score, type Truth } from '../../../../scripts/line-score';
import { buildPageLines, type PageLines } from '../../../core/line-engine';
import { itemsFromTextContent } from './textItems';

const ROOT = join(import.meta.dirname, '../../../..');
const PDFS = join(ROOT, 'fixtures/pdfs');
const asset = (dir: string) => `${ROOT}/node_modules/pdfjs-dist/${dir}/`.split('\\').join('/');

async function pageLines(file: string): Promise<PageLines[]> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(join(PDFS, file))),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    verbosity: 0,
  }).promise;
  const out: PageLines[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const items = itemsFromTextContent(await page.getTextContent(), vp);
    out.push(buildPageLines(n, items, { width: vp.width, height: vp.height }));
  }
  await doc.loadingTask.destroy();
  return out;
}

const truths = readdirSync(join(PDFS, 'truth'))
  .filter((f) => f.endsWith('.json') && !f.endsWith('.boxes.json'))
  .map((f) => JSON.parse(readFileSync(join(PDFS, 'truth', f), 'utf8')) as Truth);

describe('Line Engine corpus gate', () => {
  const groups: Record<string, Score> = {};

  for (const truth of truths) {
    it(`${truth.fixture}: no throw, matches golden`, async () => {
      const pls = await pageLines(truth.fixture);
      const g = (groups[truth.layout] ??= { tp: 0, fp: 0, fn: 0, orderOk: 0, orderN: 0 });
      for (const pl of pls) {
        const t = truth.pages.find((p) => p.page === pl.page);
        if (!t) continue;
        if (!t.hasText) expect(pl.hasTextLayer, `p${pl.page} scanned`).toBe(false);
        else if (truth.layout !== 'nonlatin') {
          const s = scorePage(t, pl);
          (Object.keys(s) as (keyof Score)[]).forEach((k) => (g[k] += s[k]));
        }
      }
      const golden = pls.map((pl) => ({
        page: pl.page,
        hasTextLayer: pl.hasTextLayer,
        lines: pl.lines.map((l) => `${l.region}|${l.text}|${[l.rect.x, l.rect.y, l.rect.w, l.rect.h].map((v) => v.toFixed(3)).join(',')}`),
      }));
      await expect(JSON.stringify(golden, null, 1) + '\n').toMatchFileSnapshot(`./__goldens__/${truth.fixture.replace('.pdf', '.json')}`);
    }, 30_000);
  }

  it('meets the S1 thresholds: F1 >= 0.97 single-column, >= 0.92 two-column; columns read in order', () => {
    expect(f1(groups.single!)).toBeGreaterThanOrEqual(0.97);
    expect(f1(groups['two-column']!)).toBeGreaterThanOrEqual(0.92);
    expect(groups['two-column']!.orderOk / groups['two-column']!.orderN).toBeGreaterThanOrEqual(0.98);
  });
});
