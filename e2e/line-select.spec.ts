import { expect, test, type Page } from '@playwright/test';
import { noIdbBlobs, openDoc as open, textRows as rows } from './helpers';

const band = (page: Page) => page.locator('.mg-selected').first();
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Line actions' });

test.describe('line selection (T-203, FR-LIN-01..04, 06, 07)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('click selects a line: band + toolbar; Copy puts the line on the clipboard', async ({ page, context, browserName, isMobile }) => {
    test.skip(isMobile, 'mouse');
    await open(page, '01-single-column-prose.pdf');
    const [r] = await rows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await expect(band(page)).toBeAttached();
    const b = (await band(page).boundingBox())!;
    expect(b.y).toBeLessThanOrEqual(r.y);
    expect(b.y + b.height).toBeGreaterThanOrEqual(r.y);
    await expect(toolbar(page)).toBeVisible();
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await toolbar(page).getByRole('button', { name: 'Copy' }).click();
      await expect(page.getByText('Copied', { exact: true })).toBeVisible();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip.length).toBeGreaterThan(10);
    }
    await toolbar(page).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.mg-selected')).toHaveCount(0);
  });

  test('a click in the gap between lines snaps to the nearest line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse');
    await open(page, '01-single-column-prose.pdf');
    const [a, c] = await rows(page, 1, 8, 9);
    await page.mouse.click(a.x, a.y + (c.y - a.y) * 0.4); // between the two baselines, nearer the first
    const b = (await band(page).boundingBox())!;
    expect(Math.abs(b.y + b.height / 2 - a.y)).toBeLessThan(Math.abs(b.y + b.height / 2 - c.y));
  });

  test('line cursor: down/J/K move, across a page break; Esc clears; arrows scroll without a cursor', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await open(page, '01-single-column-prose.pdf');
    const [r5] = await rows(page, 1, 5);
    await page.mouse.click(r5.x, r5.y);
    const y0 = (await band(page).boundingBox())!.y;
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await band(page).boundingBox())!.y).toBeGreaterThan(y0 + 5);
    await page.keyboard.press('k');
    await expect.poll(async () => Math.round((await band(page).boundingBox())!.y)).toBe(Math.round(y0));
    // to the last line of page 1, then across the break
    const [last] = await rows(page, 1, -2); // last body line (the final row is the page number)
    await page.mouse.click(last.x, last.y);
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await expect(page.locator('.page[data-page-number="2"] .mg-selected')).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mg-selected')).toHaveCount(0);
    const scroller = page.locator('.reader-scroll');
    const before = await scroller.evaluate((el) => el.scrollTop);
    await scroller.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });

  test('a native selection across three lines shows the toolbar with one rect per line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag');
    await open(page, '01-single-column-prose.pdf');
    const [a, c] = await rows(page, 1, 6, 8);
    await page.mouse.move(a.x - 30, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y, { steps: 12 });
    await page.mouse.up();
    await expect(toolbar(page)).toBeVisible();
    await expect(page.locator('.page[data-page-number="1"] .mg-selected')).toHaveCount(3);
  });

  test('phones: tapping a line selects it; tapping blank space toggles the bars', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await open(page, '01-single-column-prose.pdf');
    const [r] = await rows(page, 1, 10);
    await page.touchscreen.tap(r.x, r.y);
    await expect(band(page)).toBeAttached();
    await expect(toolbar(page)).toBeVisible();
    const pageBox = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.touchscreen.tap(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height - 12); // bottom margin: no text
    await expect(page.locator('.mg-selected')).toHaveCount(0);
  });

  test('phones: a line at the top edge gets its toolbar below it, on the page', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'narrow page');
    await open(page, '01-single-column-prose.pdf');
    const [r] = await rows(page, 1, 8);
    await page.locator('.reader-scroll').evaluate((el, dy) => (el.scrollTop += dy), r.y - 14); // the line now sits at the top edge
    await page.waitForTimeout(400); // bars slide away on scroll down
    await page.touchscreen.tap(r.x, 14);
    await expect(toolbar(page)).toBeVisible();
    const b = (await toolbar(page).boundingBox())!;
    const p1 = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    expect(b.y).toBeGreaterThan(14); // no room above: flipped below the line
    expect(b.x).toBeGreaterThanOrEqual(p1.x); // centred on the page, never off its edge
    expect(b.x + b.width).toBeLessThanOrEqual(p1.x + p1.width + 0.5);
  });

  test('scanned pages show the no-text banner and select nothing (FR-LIN-06)', async ({ page }) => {
    await open(page, '08-scanned-no-text.pdf');
    await expect(page.locator('.page[data-page-number="1"]').getByText('No selectable text on this page')).toBeVisible();
    const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
    await expect(page.locator('.mg-selected')).toHaveCount(0);
  });
});
