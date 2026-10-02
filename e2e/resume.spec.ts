import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, idb, noIdbBlobs } from './helpers';

interface PositionRow {
  page: number;
  progress: number;
  deviceId: string;
  deviceLabel: string | null;
  anchor: { page: number; rects: { x: number; y: number; h: number }[]; quote: { exact: string } } | null;
}

const TITLE = '01-single-column-prose';
const reader = (page: Page) => page.locator('.reader-scroll');

/** Scroll so that `frac` of page `n` sits at the reading slot (container top + 8 px). */
const scrollTo = (page: Page, n: number, frac: number) =>
  page.evaluate(
    ({ n, frac }) => {
      const el = document.querySelector<HTMLElement>('.reader-scroll')!;
      const bar = document.querySelector<HTMLElement>('[role="toolbar"]')!.parentElement!;
      const inset = getComputedStyle(bar).position === 'absolute' ? bar.offsetHeight + 8 : 8; // same rule as the app
      const r = document.querySelector(`.page[data-page-number="${n}"]`)!.getBoundingClientRect();
      el.scrollTop += r.top - el.getBoundingClientRect().top + frac * r.height - inset;
    },
    { n, frac },
  );

/** Which page / fraction is at the reading slot right now. */
const slot = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[role="toolbar"]')!.parentElement!;
    const inset = getComputedStyle(bar).position === 'absolute' ? bar.offsetHeight + 8 : 8;
    const top = document.querySelector('.reader-scroll')!.getBoundingClientRect().top + inset;
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
    await expect.poll(async () => (await idb<PositionRow>(page, 'positions'))[0]?.page, { timeout: 4000 }).toBe(4);
    const [pos] = await idb<PositionRow>(page, 'positions');
    expect(pos!.anchor!.rects[0]!.y).toBeCloseTo(0.5, 1);
    expect(pos!.progress).toBeCloseTo(3.5 / 6, 1);
    expect(pos!.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(pos!.deviceLabel).toBeTruthy();

    const barOffScreen = await page
      .getByRole('toolbar', { name: 'Reader toolbar' })
      .evaluate((el) => el.getBoundingClientRect().bottom <= 1);
    if (barOffScreen) {
      // phones: chrome auto-hid on scroll; a tap on blank space (left margin) brings it back (without scrolling)
      const box = (await reader(page).boundingBox())!;
      await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
    }
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

  test('line level: saves the reading line (band + quote), brings it back to the slot, marks it for 2 s (T-206)', async ({
    page,
  }) => {
    await page.goto('/');
    await addViaPicker(page, `${TITLE}.pdf`);
    await openFromLibrary(page);
    await scrollTo(page, 3, 0.4);
    const saved = async () => (await idb<PositionRow>(page, 'positions'))[0]?.anchor;
    await expect
      .poll(
        async () => {
          const a = await saved();
          return a?.page === 3 && a.quote.exact !== '';
        },
        { timeout: 4000 },
      )
      .toBe(true);
    const band = (await idb<PositionRow>(page, 'positions'))[0]!.anchor!.rects[0]!;
    expect(band.h).toBeGreaterThan(0); // a line band, not the page-level point
    expect(band.y).toBeGreaterThan(0.36); // the first line whose top is at/below the slot (its band may start just above)
    expect(band.y).toBeLessThan(0.45);

    await page.reload();
    await expect(page.locator('.page[data-page-number="3"] .mg-resume')).toBeAttached(); // left-edge triangle
    await expect.poll(() => slot(page)).toMatchObject({ page: 3 });
    expect((await slot(page))!.frac).toBeCloseTo(band.y, 2); // the line sits at the reading slot
    await expect(page.locator('.mg-resume')).toHaveCount(0, { timeout: 4000 }); // gone after 2 s
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

test.describe('cross-device resume prompt (T-303, FR-BKM-05)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  /** A newer synced position from another device, as a pull would store it. */
  async function seedRemote(page: Page, documentId: string, pageNo = 4) {
    await page.evaluate(
      (row) =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('marginalia');
          open.onsuccess = () => {
            const tx = open.result.transaction('positions', 'readwrite');
            tx.objectStore('positions').put(row);
            tx.oncomplete = () => (open.result.close(), resolve());
          };
        }),
      {
        documentId,
        page: pageNo,
        anchor: {
          v: 1,
          page: pageNo,
          rects: [{ x: 0.1, y: 0.3, w: 0.8, h: 0.02 }],
          quote: { exact: 'line', prefix: '', suffix: '' },
        },
        progress: 0.6,
        deviceId: 'other-device',
        deviceLabel: 'Pixel 7',
        updatedAt: new Date(Date.now() + 60_000).toISOString(),
        localUpdatedAt: 0,
      },
    );
  }

  test('offers the other device’s newer point and jumps only when asked; Stay keeps this device’s place', async ({
    page,
  }) => {
    await page.goto('/');
    await addViaPicker(page, `${TITLE}.pdf`);
    await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();
    const [doc] = await idb<{ id: string }>(page, 'documents');
    await seedRemote(page, doc!.id);

    await openFromLibrary(page);
    const prompt = page.getByRole('status').filter({ hasText: 'Continue from Pixel 7 (p. 4)?' });
    await expect(prompt).toBeVisible();
    await page.waitForTimeout(300);
    expect((await slot(page))!.page).toBe(1); // never an automatic jump
    await prompt.getByRole('button', { name: 'Jump' }).click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(() => slot(page)).toMatchObject({ page: 4 });
    expect((await slot(page))!.frac).toBeCloseTo(0.3, 2);

    if (
      await page
        .getByRole('toolbar', { name: 'Reader toolbar' })
        .evaluate((el) => el.getBoundingClientRect().bottom <= 1)
    ) {
      const box = (await reader(page).boundingBox())!;
      await page.touchscreen.tap(box.x + 4, box.y + box.height / 2); // phones: bring the bars back (blank tap)
    }
    await page.getByRole('link', { name: 'Library' }).click();
    await seedRemote(page, doc!.id, 2); // another, newer point elsewhere arrives
    await openFromLibrary(page);
    const second = page.getByRole('status').filter({ hasText: 'Continue from Pixel 7 (p. 2)?' });
    await expect(second).toBeVisible();
    await second.getByRole('button', { name: 'Stay' }).click();
    await expect(second).toHaveCount(0);
    expect((await slot(page))!.page).toBe(4); // this device's own last place (saved after the jump)
  });
});
