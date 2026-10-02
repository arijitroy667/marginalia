import { expect, test, type Page } from '@playwright/test';
import { idb, noIdbBlobs, openDoc, textRows } from './helpers';

interface Row {
  id: string;
  kind: string;
  page: number;
  label: string | null;
  deletedAt: string | null;
  anchor: { rects: { x: number; y: number; w: number; h: number }[] };
}
const bookmarks = async (page: Page) =>
  (await idb<Row>(page, 'annotations')).filter((a) => a.kind === 'bookmark' && a.deletedAt === null);
const ribbons = (page: Page, n = 1) => page.locator(`.page[data-page-number="${n}"] .mg-ribbon`);
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Line actions' });

test.describe('bookmarks (T-205, FR-BKM-01..03)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('B bookmarks the selected line, labelled with its first 60 chars; B again removes it, with Undo', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('b');
    await expect(ribbons(page)).toHaveCount(1);
    await expect(page.getByText('Bookmarked page 1', { exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole('button', { name: 'Bookmark' })).toHaveAttribute('aria-pressed', 'true');
    const [b] = await bookmarks(page);
    expect(b!.label!.length).toBeGreaterThan(10);
    expect(b!.label!.length).toBeLessThanOrEqual(60);

    await page.keyboard.press('b');
    await expect(ribbons(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(ribbons(page)).toHaveCount(1);
    expect((await bookmarks(page)).map((x) => x.id)).toEqual([b!.id]);
  });

  test('with no line selected, B bookmarks the reading line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.locator('.reader-scroll').evaluate((el) => {
      const p2 = el.querySelector('.page[data-page-number="2"]')!;
      el.scrollTop += p2.getBoundingClientRect().top - el.getBoundingClientRect().top; // page 2 at the top
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('b');
    await expect.poll(async () => (await bookmarks(page)).map((b) => b.page)).toEqual([2]);
    const [b] = await bookmarks(page);
    expect(b!.anchor.rects[0]!.y).toBeLessThan(0.15); // the first line on page 2
    expect(b!.label).toBeTruthy();
  });

  test('the sidebar lists bookmarks; a click jumps and flashes the line; [ and ] step between them', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    const [r1] = await textRows(page, 1, 8);
    await page.mouse.click(r1.x, r1.y);
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');
    const [r3] = await textRows(page, 3, 5);
    await page.mouse.click(r3.x, r3.y);
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await bookmarks(page)).length).toBe(2);

    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page.getByRole('tab', { name: 'Bookmarks' }).click();
    const panel = page.getByRole('tabpanel', { name: 'Bookmarks' });
    const items = panel.getByRole('listitem').getByRole('button');
    await expect(items).toHaveCount(2);
    await expect(panel.getByRole('region', { name: 'Page 1' }).getByRole('button')).toHaveCount(1);
    await expect(panel.getByRole('region', { name: 'Page 3' }).getByRole('button')).toHaveCount(1);
    await items.first().click();
    await expect(page.locator('.page[data-page-number="1"] .mg-flash')).toBeAttached();
    await expect(page.locator('.mg-flash')).toHaveCount(0, { timeout: 3000 }); // the pulse ends after 1.2 s
    const scroller = (await page.locator('.reader-scroll').boundingBox())!;
    expect((await ribbons(page, 1).boundingBox())!.y - scroller.y).toBeLessThan(60); // the line sits at the reading slot

    await page.locator('.reader-scroll').focus();
    await page.keyboard.press(']');
    await expect(page.locator('.page[data-page-number="3"] .mg-flash')).toBeAttached();
    await page.keyboard.press(']');
    await expect(page.getByText('No bookmark after this point', { exact: true })).toBeVisible();
    await page.keyboard.press('[');
    await expect(page.locator('.page[data-page-number="1"] .mg-flash')).toBeAttached();
  });

  test('the ribbon opens a popover to rename or delete the bookmark', async ({ page, isMobile }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    if (isMobile) await page.touchscreen.tap(r.x, r.y);
    else await page.mouse.click(r.x, r.y);
    await toolbar(page).getByRole('button', { name: 'Bookmark' }).click();
    await expect(ribbons(page)).toHaveCount(1);
    await ribbons(page).click();
    const input = page.getByRole('textbox', { name: 'Label' });
    await input.fill('Chapter one argument');
    await input.press('Enter');
    await expect.poll(async () => (await bookmarks(page))[0]?.label).toBe('Chapter one argument');
    await expect(ribbons(page)).toHaveAttribute('aria-label', 'Bookmark: Chapter one argument');
    await page.getByRole('button', { name: 'Delete bookmark' }).click();
    await expect(ribbons(page)).toHaveCount(0);
    expect(await bookmarks(page)).toEqual([]);
  });

  test('phones: Quick bookmark in the bottom bar marks the reading line', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'bottom bar');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.getByRole('toolbar', { name: 'Page controls' }).getByRole('button', { name: 'Quick bookmark' }).click();
    await expect(ribbons(page)).toHaveCount(1);
    expect(await bookmarks(page)).toMatchObject([{ page: 1 }]);
  });

  test('pages without text take page-level bookmarks (FR-LIN-06)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '08-scanned-no-text.pdf');
    await page.keyboard.press('b');
    await expect
      .poll(async () => (await bookmarks(page)).map((b) => [b.page, b.label, b.anchor.rects[0]]))
      .toEqual([[1, null, { x: 0, y: 0, w: 1, h: 1 }]]);
  });
});
