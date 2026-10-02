import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, noIdbBlobs } from './helpers';

async function open(page: Page, fixture: string, title: string) {
  await page.goto('/');
  await addViaPicker(page, fixture);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
}
const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });

test.describe('selection, links, rotation (T-109, FR-RDR-07..09)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('internal link jumps; browser Back returns to the prior position', async ({ page }) => {
    await open(page, '16-outline-links.pdf', '16-outline-links');
    const internal = page.locator('.page[data-page-number="1"] .annotationLayer a:not([href^="http"])');
    await expect(internal).toHaveCount(1);
    await internal.click();
    await expect(pageInput(page)).toHaveValue('4');
    await page.goBack();
    await expect(pageInput(page)).toHaveValue('1');
    await expect(page).toHaveURL(/\/read\//);
    await page.goForward();
    await expect(pageInput(page)).toHaveValue('4');
  });

  test('external links open in a new tab with noopener noreferrer', async ({ page }) => {
    await open(page, '16-outline-links.pdf', '16-outline-links');
    const ext = page.locator('.page[data-page-number="1"] .annotationLayer a[href="https://example.com/"]');
    await expect(ext).toHaveAttribute('target', '_blank');
    await expect(ext).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('native selection across lines keeps line breaks', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag');
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    const spans = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]');
    await expect(spans.first()).toBeAttached();
    // drag from the start of one body line to the middle of the line two below it
    const rows = await spans.evaluateAll((els) => {
      const ys = new Map<number, DOMRect>();
      for (const e of els) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !ys.has(Math.round(r.top))) ys.set(Math.round(r.top), r);
      }
      return [...ys.values()].sort((a, b) => a.top - b.top).map((r) => ({ x: r.left + 2, y: r.top + r.height / 2 }));
    });
    const a = rows[6]!, c = rows[8]!;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 120, c.y, { steps: 10 });
    await page.mouse.up();
    const text = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(text.length).toBeGreaterThan(40);
    expect(text.split('\n').filter((l) => l.trim()).length).toBeGreaterThanOrEqual(3);
  });

  test('rotate view in 90 degree steps', async ({ page, isMobile }) => {
    test.skip(isMobile, 'rotate lives in the desktop toolbar until T-112');
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    const dims = () => page.locator('.page[data-page-number="1"]').evaluate((e) => [e.clientWidth, e.clientHeight]);
    const [w0, h0] = await dims();
    expect(h0).toBeGreaterThan(w0!);
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await expect.poll(async () => { const [w, h] = await dims(); return w! > h!; }).toBe(true);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await expect.poll(async () => { const [w, h] = await dims(); return h! > w!; }).toBe(true);
  });
});
