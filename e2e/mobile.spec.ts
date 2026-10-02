import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, noIdbBlobs } from './helpers';

async function open(page: Page) {
  await page.goto('/');
  await addViaPicker(page, '01-single-column-prose.pdf');
  await page.getByRole('link', { name: /01-single-column-prose/ }).click();
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
}
const topBar = (page: Page) => page.getByRole('toolbar', { name: 'Reader toolbar' });
const bottomBar = (page: Page) => page.getByRole('toolbar', { name: 'Page controls' });
const onScreen = (page: Page, which: 'top' | 'bottom') =>
  (which === 'top' ? topBar(page) : bottomBar(page)).evaluate((el, which) => {
    const r = el.getBoundingClientRect();
    return which === 'top' ? r.bottom > 1 : r.top < window.innerHeight - 1;
  }, which);
const scale = (page: Page) => page.evaluate(() => Number(getComputedStyle(document.querySelector('.pdfViewer')!).getPropertyValue('--scale-factor')));

test.describe('mobile reader (T-112, PRD §10.3, FR-RDR-03 pinch)', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs');
  });

  test('top bar: back, title, find; bottom bar: page, scrubber, sidebar, theme', async ({ page }) => {
    await open(page);
    await expect(topBar(page).getByRole('link', { name: 'Library' })).toBeVisible();
    await expect(topBar(page).getByRole('heading', { name: '01-single-column-prose' })).toBeVisible();
    await expect(topBar(page).getByRole('button', { name: 'Find in document' })).toBeVisible();
    await expect(bottomBar(page).getByRole('textbox', { name: 'Page number' })).toBeVisible();
    await expect(bottomBar(page).getByRole('slider', { name: 'Go to page' })).toBeVisible();
    await expect(bottomBar(page).getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
    await expect(bottomBar(page).getByRole('button', { name: 'Theme' })).toBeVisible();
  });

  test('bars hide on scroll down, return on scroll up; a tap on the page toggles them', async ({ page }) => {
    await open(page);
    const scroller = page.locator('.reader-scroll');
    await scroller.evaluate((el) => (el.scrollTop = 900));
    await expect.poll(() => onScreen(page, 'top')).toBe(false);
    await expect.poll(() => onScreen(page, 'bottom')).toBe(false);
    await scroller.evaluate((el) => (el.scrollTop = 500));
    await expect.poll(() => onScreen(page, 'top')).toBe(true);
    await expect.poll(() => onScreen(page, 'bottom')).toBe(true);
    const box = (await scroller.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => onScreen(page, 'top')).toBe(false);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => onScreen(page, 'top')).toBe(true);
  });

  test('pages start below the overlay top bar: on open and after a jump', async ({ page }) => {
    await open(page);
    const gap = (n: number) =>
      page.evaluate((n) => {
        const bar = document.querySelector('[role="toolbar"]')!.getBoundingClientRect();
        return document.querySelector(`.page[data-page-number="${n}"]`)!.getBoundingClientRect().top - bar.bottom;
      }, n);
    await expect.poll(() => gap(1)).toBeGreaterThanOrEqual(0);
    const input = bottomBar(page).getByRole('textbox', { name: 'Page number' });
    await input.fill('4');
    await input.press('Enter');
    await expect(input).toHaveValue('4');
    expect(await gap(4)).toBeGreaterThanOrEqual(0);
  });

  test('scrubber moves through pages', async ({ page }) => {
    await open(page);
    const slider = bottomBar(page).getByRole('slider', { name: 'Go to page' });
    await slider.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(bottomBar(page).getByRole('textbox', { name: 'Page number' })).toHaveValue('5');
  });

  test('two-finger pinch zooms and commits on release', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'synthetic Touch objects need Chromium');
    await open(page);
    const before = await scale(page);
    await page.locator('.reader-scroll').evaluate(async (el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (type: string, d: number | null) => {
        const ts = d === null ? [] : [new Touch({ identifier: 1, target: el, clientX: cx - d / 2, clientY: cy }), new Touch({ identifier: 2, target: el, clientX: cx + d / 2, clientY: cy })];
        el.dispatchEvent(new TouchEvent(type, { touches: ts, targetTouches: ts, changedTouches: ts.length ? ts : [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })], bubbles: true, cancelable: true }));
      };
      fire('touchstart', 100);
      for (let d = 100; d <= 180; d += 10) {
        fire('touchmove', d);
        await new Promise((res) => requestAnimationFrame(res));
      }
      fire('touchend', null);
    });
    await expect.poll(() => scale(page)).toBeGreaterThan(before * 1.6);
  });
});
