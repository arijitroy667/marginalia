import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION } from '../../../core/line-engine';
import { db } from '../../../core/db/schema';
import { getPageLines } from './pageLines';

/** Minimal PDF.js document: one horizontal item per page. */
function fakePdf(fail = false) {
  return {
    getPage: vi.fn((n: number) => {
      if (fail) return Promise.reject(new Error('broken page'));
      return Promise.resolve({
        getViewport: () => ({ transform: [1, 0, 0, -1, 0, 800], width: 600, height: 800, scale: 1 }),
        getTextContent: () =>
          Promise.resolve({
            items: [{ str: `Line on page ${n}`, transform: [10, 0, 0, 10, 50, 700], width: 100, height: 10, fontName: 'f', hasEOL: false }],
            styles: { f: { ascent: 0.8, descent: -0.2, vertical: false } },
          }),
      });
    }),
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('getPageLines', () => {
  it('builds once, then serves from memory; persists to the Dexie cache', async () => {
    const pdf = fakePdf();
    const a = await getPageLines(pdf as never, 'h1', 1);
    const b = await getPageLines(pdf as never, 'h1', 1);
    expect(a?.lines[0]?.text).toBe('Line on page 1');
    expect(b).toBe(a);
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect(await db.lineCache.get(['h1', 1, ENGINE_VERSION])).toBeTruthy());
  });

  it('reads the Dexie cache across sessions without touching PDF.js', async () => {
    await db.lineCache.put({ docHash: 'h2', page: 3, engine: ENGINE_VERSION, data: { engineVersion: ENGINE_VERSION, page: 3, lines: [], text: '', textNorm: '', hasTextLayer: false } });
    const pdf = fakePdf();
    const pl = await getPageLines(pdf as never, 'h2', 3);
    expect(pl?.hasTextLayer).toBe(false);
    expect(pdf.getPage).not.toHaveBeenCalled();
  });

  it('never throws: failures yield null and are retried later (FR-LIN-07)', async () => {
    expect(await getPageLines(fakePdf(true) as never, 'h3', 1)).toBeNull();
    expect((await getPageLines(fakePdf() as never, 'h3', 1))?.lines).toHaveLength(1);
  });
});
