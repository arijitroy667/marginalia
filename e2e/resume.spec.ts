import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, idb, noIdbBlobs } from './helpers';

interface PositionRow {
  page: number;
  progress: number;
  deviceId: string;
  deviceLabel: string | null;
  anchor: { page: number; rects: { x: number; y: number }[] } | null;
}

const TITLE = '01-single-column-prose';
const reader = (page: Page) => page.locator('.reader-scroll');

/** Scroll so that `frac` of page `n` sits at the reading slot (container top + 8 px). */
const scrollTo = (page: Page, n: number, frac: number) =>
  page.evaluate(
    ({ n, frac }) => {
      const el = document.querySelector<HTMLElement>('.reader-scroll')!;
      const r = document.querySelector(`.page[data-page-number="${n}"]`)!.getBoundingClientRect();
      el.scrollTop += r.top - el.getBoundingClientRect().top + frac * r.height - 8;
    },
    { n, frac },
  );

/** Which page / fraction is at the reading slot right now. */
const slot = (page: Page) =>
  page.evaluate(() => {
    const top = document.querySelector('.reader-scroll')!.getBoundingClientRect().top + 8;
    for (const p of document.querySelectorAll<HTMLElement>('.page')) {
      const r = p.getBoundingClientRect();
      if (r.bottom >= top) return { page: Number(p.dataset.pageNumber), frac: (top - r.top) / r.height };
    }
    return null;
  });

async function openFromLibrary(page: Page) {
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
}

test.describe('page-level resume (T-110, FR-BKM-04)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('saves after scroll idle, shows progress, restores on reopen and reload', async ({ page }) => {
    await page.goto('/');
    await addViaPicker(page, `${TITLE}.pdf`);
    await openFromLibrary(page);
    await scrollTo(page, 4, 0.5);
    await expect
      .poll(async () => (await idb<PositionRow>(page, 'positions'))[0]?.page, { timeout: 4000 })
      .toBe(4);
    const [pos] = await idb<PositionRow>(page, 'positions');
    expect(pos!.anchor!.rects[0]!.y).toBeCloseTo(0.5, 1);
    expect(pos!.progress).toBeCloseTo(3.5 / 6, 1);
    expect(pos!.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(pos!.deviceLabel).toBeTruthy();

    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toContainText(/5[89]% read/);

    await openFromLibrary(page);
    await expect.poll(() => slot(page)).toMatchObject({ page: 4 });
    expect((await slot(page))!.frac).toBeCloseTo(0.5, 1);

    await page.reload();
    await expect(page.locator('.page[data-page-number="1"]')).toBeAttached();
    await expect.poll(() => slot(page)).toMatchObject({ page: 4 });
    expect((await slot(page))!.frac).toBeCloseTo(0.5, 1);
  });

  test('going hidden saves immediately (tab switch, app backgrounded)', async ({ page }) => {
    await page.goto('/');
    await addViaPicker(page, `${TITLE}.pdf`);
    await openFromLibrary(page);
    await scrollTo(page, 2, 0.25);
    await reader(page).evaluate((el) => el.dispatchEvent(new Event('scroll'))); // ensure the latest point is tracked
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await idb<PositionRow>(page, 'positions'))[0]?.page, { timeout: 900 }).toBe(2); // < debounce
  });
});
