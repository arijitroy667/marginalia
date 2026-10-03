import { expect, test, type Page } from '@playwright/test';
import { noIdbBlobs, openDoc, textRows } from './helpers';

const pageEl = (page: Page, n: number) => page.locator(`.page[data-page-number="${n}"]`);
const canvasOf = (page: Page, n: number) => pageEl(page, n).locator('.canvasWrapper canvas').first();
const filterOf = (page: Page, n: number) =>
  pageEl(page, n)
    .locator('.canvasWrapper')
    .evaluate((el) => getComputedStyle(el).filter);

async function setTheme(page: Page, name: 'Light' | 'Warm' | 'Dark') {
  await page.getByRole('button', { name: 'Theme' }).first().click();
  await page.getByRole('radio', { name }).check();
  await page.keyboard.press('Escape');
}

/** Mean colour of a small screenshot patch (CSS px), e.g. empty paper. */
async function patch(page: Page, x: number, y: number) {
  const png = await page.screenshot({ clip: { x, y, width: 6, height: 6 } });
  return page.evaluate(async (b64) => {
    // decoded without fetch(data:): the app's CSP (connect-src 'self') applies to this page too
    const bmp = await createImageBitmap(
      new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
    );
    const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
    return sum.map((v) => Math.round(v / (d.length / 4)));
  }, png.toString('base64'));
}
const near = (a: number[], b: number[], tol = 6) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

test.describe('theme engine (T-209, FR-THM-02..05, ADR 0002)', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs');
    test.skip(isMobile, 'same CSS on phones; measured on desktop');
  });

  test('Dark recolours pages by CSS only: no re-render, already-dark slides skipped, images restored unless inverted', async ({
    page,
  }) => {
    await openDoc(page, '04-slides-16x9.pdf');
    await canvasOf(page, 1).evaluate((el) => ((window as unknown as { __c: Element }).__c = el));
    await setTheme(page, 'Dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(pageEl(page, 1)).toHaveAttribute('data-mg-dark', ''); // navy title slide: left as is
    expect(await filterOf(page, 1)).toBe('none');
    expect(await canvasOf(page, 1).evaluate((el) => (window as unknown as { __c: Element }).__c === el)).toBe(true); // same pixels, no re-render (FR-THM-04)

    await pageEl(page, 3).scrollIntoViewIfNeeded();
    await expect(pageEl(page, 3).locator('.mg-img-restore canvas')).toHaveCount(1); // the photo keeps its colours
    expect(await filterOf(page, 3)).toContain('url(');
    await page.getByRole('button', { name: 'Theme' }).first().click();
    await page.getByRole('checkbox', { name: 'Invert images in Dark' }).check();
    await page.keyboard.press('Escape');
    await expect(pageEl(page, 3).locator('.mg-img-restore')).toHaveCount(0);
  });

  test('paper and text take the theme tokens; a scanned page stays inverted in Dark', async ({ page }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const box = (await pageEl(page, 1).boundingBox())!;
    const paper = () => patch(page, box.x + 30, box.y + 30); // top-left margin: no ink
    expect(near(await paper(), [255, 255, 255])).toBe(true);
    await setTheme(page, 'Warm');
    await expect.poll(async () => near(await paper(), [0xf4, 0xec, 0xd8])).toBe(true);
    await setTheme(page, 'Dark');
    await expect.poll(async () => near(await paper(), [0x12, 0x12, 0x12])).toBe(true);

    await openDoc(page, '08-scanned-no-text.pdf');
    await expect(pageEl(page, 1)).not.toHaveAttribute('data-mg-dark', '');
    expect(await filterOf(page, 1)).toContain('url(');
    await expect(pageEl(page, 1).locator('.mg-img-restore')).toHaveCount(0); // > 80 % image: inverted like text
  });

  test('warmth overlay tints the reader without blocking input; switching theme stays under 300 ms', async ({
    page,
  }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    await page.getByRole('button', { name: 'Theme' }).first().click();
    await page.getByRole('slider', { name: /Warmth/ }).fill('100');
    await page.keyboard.press('Escape');
    const warmth = page.locator('.mg-warmth');
    await expect(warmth).toHaveCSS('background-color', 'rgb(255, 191, 102)');
    await expect(warmth).toHaveCSS('pointer-events', 'none');
    await expect(warmth).toHaveCSS('mix-blend-mode', 'multiply');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await expect(page.getByRole('toolbar', { name: 'Line actions' })).toBeVisible(); // FR-THM-03: never blocks input
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Theme' }).first().click();
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const t0 = performance.now();
          new MutationObserver(() => requestAnimationFrame(() => resolve(performance.now() - t0))).observe(
            document.documentElement,
            {
              attributes: true,
              attributeFilter: ['data-theme'],
            },
          );
          document.querySelector<HTMLInputElement>('input[type="radio"][value="dark"]')!.click();
        }),
    );
    console.log(`theme switch: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(300); // NFR-PERF-05
  });
});
