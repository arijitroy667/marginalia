import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addViaPicker, fixture, idb, noIdbBlobs } from './helpers';

const BOXES = JSON.parse(readFileSync(fixture('truth/15-geometry-calibration.boxes.json'), 'utf8')) as {
  pages: { page: number; boxes: { canonical: [number, number, number, number] }[] }[];
};

async function openWithHighlight(page: Page) {
  await page.goto('/');
  await addViaPicker(page, '15-geometry-calibration.pdf');
  await expect(page.getByRole('link', { name: /15-geometry-calibration/ })).toBeVisible();
  const [doc] = await idb<{ id: string }>(page, 'documents');
  const [x, y, w, h] = BOXES.pages[0]!.boxes[1]!.canonical;
  const t = new Date().toISOString();
  await page.evaluate(
    (row) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('marginalia');
        open.onsuccess = () => {
          const tx = open.result.transaction('annotations', 'readwrite');
          tx.objectStore('annotations').put(row);
          tx.oncomplete = () => (open.result.close(), resolve());
        };
      }),
    {
      id: '00000000-0000-4000-8000-0000000000aa',
      documentId: doc!.id,
      kind: 'highlight',
      page: 1,
      anchor: { v: 1, page: 1, rects: [{ x, y, w, h }], quote: { exact: '', prefix: '', suffix: '' } },
      colorId: 1,
      body: null,
      label: null,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      localUpdatedAt: 0,
    },
  );
  await page.getByRole('link', { name: /15-geometry-calibration/ }).click();
  await expect(page.locator('.page[data-page-number="1"] .mg-hl')).toBeAttached();
}

/** Max edge distance (CSS px) between the highlight rect and the black box it should cover. */
async function drift(page: Page): Promise<number> {
  const hl = page.locator('.page[data-page-number="1"] .mg-hl');
  await hl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400); // re-render after zoom/rotate
  const o = (await hl.boundingBox())!;
  const pad = 8;
  const clip = { x: o.x - pad, y: o.y - pad, width: o.width + 2 * pad, height: o.height + 2 * pad };
  const png = await page.screenshot({ clip });
  const ink = await page.evaluate(async (b64) => {
    // decoded without fetch(data:): the app's CSP (connect-src 'self') applies to this page too
    const bmp = await createImageBitmap(
      new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
    );
    const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < bmp.height; y++)
      for (let x = 0; x < bmp.width; x++) {
        const i = (y * bmp.width + x) * 4;
        if (data[i]! + data[i + 1]! + data[i + 2]! < 3 * 100) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
      }
    return { x0, y0, x1, y1, dpr: devicePixelRatio };
  }, png.toString('base64'));
  const d = ink.dpr;
  return Math.max(
    Math.abs(ink.x0 / d + clip.x - o.x),
    Math.abs(ink.y0 / d + clip.y - o.y),
    Math.abs(ink.x1 / d + clip.x - (o.x + o.width)),
    Math.abs(ink.y1 / d + clip.y - (o.y + o.height)),
  );
}

test.describe('overlay manager (T-202, PRD §8.4)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('a stored highlight covers its rect exactly; survives rotation and zoom re-renders', async ({
    page,
    isMobile,
  }) => {
    await openWithHighlight(page);
    // fractional DPR (Pixel 7 = 2.625): PDF.js snaps the canvas, ink sits ~2-3 px off its CSS layout (ADR 0003)
    expect(await drift(page)).toBeLessThanOrEqual(isMobile ? 3.5 : 2);
    if (isMobile) return; // rotate/zoom controls live in the desktop toolbar
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    expect(await drift(page)).toBeLessThanOrEqual(2);
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await page.getByRole('combobox', { name: 'Zoom' }).selectOption('2');
    await expect(page.locator('.page[data-page-number="1"] .mg-hl')).toBeAttached(); // re-attached after PDF.js reset
    expect(await drift(page)).toBeLessThanOrEqual(2);
  });

  test('desktop hover shows a band on the line under the mouse', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no hover on touch');
    await page.goto('/');
    await addViaPicker(page, '01-single-column-prose.pdf');
    await page.getByRole('link', { name: /01-single-column-prose/ }).click();
    const span = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]').nth(12);
    await expect(span).toBeAttached();
    await span.scrollIntoViewIfNeeded();
    const b = (await span.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2);
    const band = page.locator('.page[data-page-number="1"] .mg-hover');
    await expect(band).toBeAttached();
    const r = (await band.boundingBox())!;
    expect(r.y).toBeLessThanOrEqual(b.y + b.height / 2);
    expect(r.y + r.height).toBeGreaterThanOrEqual(b.y + b.height / 2);
    await page.mouse.move(5, 5); // off the page
    await expect(band).toHaveCount(0);
  });
});
