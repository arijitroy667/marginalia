import { expect, test, type Page } from '@playwright/test';
import { idb, noIdbBlobs, openDoc, textRows } from './helpers';

interface Row {
  id: string;
  kind: string;
  colorId: number | null;
  deletedAt: string | null;
  anchor: { rects: unknown[] };
}
const highlights = async (page: Page) => (await idb<Row>(page, 'annotations')).filter((a) => a.kind === 'highlight' && a.deletedAt === null);
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Line actions' });
const swatch = (page: Page, label: string) => toolbar(page).getByRole('button', { name: `Highlight: ${label}` });
const washes = (page: Page) => page.locator('.page[data-page-number="1"] .mg-hl');
const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('highlights (T-204, FR-HLT-01..04, FR-KEY-06)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('swatches: apply, replace and remove with Undo; rendered from stored rects; survive reload', async ({ page, isMobile }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    if (isMobile) await page.touchscreen.tap(r.x, r.y);
    else await page.mouse.click(r.x, r.y);
    await expect(toolbar(page).getByRole('button', { name: /^Highlight: / })).toHaveCount(5); // default palette (FR-HLT-02)

    await swatch(page, 'Key idea').click(); // 2 inputs: select + colour (FR-HLT-01)
    await expect(washes(page)).toHaveCount(1);
    await expect(swatch(page, 'Key idea')).toHaveAttribute('aria-pressed', 'true');
    const [row] = await highlights(page);
    expect(row).toMatchObject({ colorId: 1 });
    expect(await washes(page).first().evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(255, 224, 102)');

    await swatch(page, 'Definition').click(); // another colour replaces (FR-HLT-03)
    await expect(page.getByText('Highlight changed to “Definition”', { exact: true })).toBeVisible();
    await expect.poll(async () => (await highlights(page)).map((h) => [h.id, h.colorId])).toEqual([[row!.id, 2]]);

    await swatch(page, 'Definition').click(); // same colour removes, tombstoned (FR-HLT-03/04)
    await expect(washes(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).last().click(); // toast Undo restores the same id (FR-KEY-06)
    await expect(washes(page)).toHaveCount(1);
    expect((await highlights(page)).map((h) => h.id)).toEqual([row!.id]);

    await page.reload();
    await expect(washes(page)).toHaveCount(1);
  });

  test('keys: digits set the active colour, H applies it, digits recolour, Delete removes, Ctrl+Z / Ctrl+Shift+Z', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.keyboard.press('3'); // no line selected: sets the active colour
    await expect(page.getByText('Highlight colour: Look up', { exact: true })).toBeVisible();
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await expect(toolbar(page)).toBeVisible();
    await page.keyboard.press('h'); // 1 input with an active colour (FR-HLT-01)
    await expect.poll(async () => (await highlights(page)).map((h) => h.colorId)).toEqual([3]);
    await page.keyboard.press('1');
    await expect.poll(async () => (await highlights(page)).map((h) => h.colorId)).toEqual([1]);
    await page.keyboard.press(`${PRIMARY}+z`);
    await expect.poll(async () => (await highlights(page)).map((h) => h.colorId)).toEqual([3]);
    await page.keyboard.press(`${PRIMARY}+Shift+z`);
    await expect.poll(async () => (await highlights(page)).map((h) => h.colorId)).toEqual([1]);
    const id = (await highlights(page))[0]!.id;
    await page.keyboard.press('Delete');
    await expect(washes(page)).toHaveCount(0);
    await expect(page.getByText('Highlight removed', { exact: true })).toBeVisible();
    await page.keyboard.press(`${PRIMARY}+z`);
    await expect.poll(async () => (await highlights(page)).map((h) => h.id)).toEqual([id]);
    await page.keyboard.press('j'); // next line, then H with the last-used colour
    await page.keyboard.press('h');
    await expect.poll(async () => (await highlights(page)).map((h) => h.colorId)).toEqual([1, 1]);
  });

  test('a native selection over three lines becomes one highlight with three rects', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse drag');
    await openDoc(page, '01-single-column-prose.pdf');
    const [a, c] = await textRows(page, 1, 6, 8);
    await page.mouse.move(a.x - 30, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y, { steps: 12 });
    await page.mouse.up();
    await swatch(page, 'Revisit').click();
    await expect(washes(page)).toHaveCount(3);
    await expect(toolbar(page)).toHaveCount(0); // the selection is consumed
    expect(await highlights(page)).toMatchObject([{ colorId: 5, anchor: { rects: [{}, {}, {}] } }]);
  });
});
