import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, idb, noIdbBlobs, openDoc, textRows } from './helpers';

const TITLE = /01-single-column-prose/;
const menu = (page: Page) => page.getByRole('button', { name: /^Actions for/ }).first();

test.describe('library and reader extras (T-408, FR-LIB-07/08, FR-RDR-10/11)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs"));

  test('rename; keep offline; delete file only keeps annotations; delete everything removes the book', async ({
    page,
    isMobile,
  }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    if (isMobile) await page.touchscreen.tap(r.x, r.y);
    else await page.mouse.click(r.x, r.y);
    await page.getByRole('button', { name: 'Highlight: Key idea' }).click();
    await page.goto('/');

    await menu(page).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('On Reading Slowly');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('link', { name: /On Reading Slowly/ })).toBeVisible();

    await menu(page).click();
    await page.getByRole('menuitemcheckbox', { name: 'Keep offline' }).click();
    await expect.poll(async () => (await idb<{ pinned: boolean }>(page, 'files'))[0]?.pinned).toBe(true);

    await menu(page).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await page.getByRole('button', { name: /^Delete file only/ }).click();
    await expect(page.getByRole('link', { name: /On Reading Slowly/ })).toBeVisible(); // still in the library
    expect(await idb(page, 'files')).toEqual([]);
    expect((await idb<{ deletedAt: string | null }>(page, 'annotations')).map((a) => a.deletedAt)).toEqual([null]);
    await page.getByRole('link', { name: /On Reading Slowly/ }).click();
    await expect(page.getByRole('button', { name: 'Attach file' })).toBeVisible(); // can be read again by attaching

    await page.goto('/');
    await menu(page).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await page.getByRole('button', { name: /^Delete everything/ }).click();
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    expect((await idb<{ deletedAt: string | null }>(page, 'annotations')).every((a) => a.deletedAt)).toBe(true);

    await addViaPicker(page, '01-single-column-prose.pdf'); // the same file can be added again
    await expect(page.getByRole('link', { name: TITLE })).toBeVisible();
  });

  test('page layouts: two-page spread keeps annotations on their page; single page shows one page', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop layouts');
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 2, 4);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('1');
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Page layout' }).selectOption('spread');
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all(
          [1, 2].map((n) => page.locator(`.page[data-page-number="${n}"]`).boundingBox()),
        );
        return Math.abs(a!.y - b!.y) < 2 && b!.x > a!.x + a!.width / 2; // side by side
      })
      .toBe(true);
    const hl = (await page.locator('.page[data-page-number="2"] .mg-hl').boundingBox())!;
    const p2 = (await page.locator('.page[data-page-number="2"]').boundingBox())!;
    expect(hl.x).toBeGreaterThanOrEqual(p2.x);
    expect(hl.x + hl.width).toBeLessThanOrEqual(p2.x + p2.width + 1); // inside its page

    await page.getByRole('combobox', { name: 'Page layout' }).selectOption('single');
    await expect(page.locator('.page[data-page-number="3"]')).toBeHidden();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Page layout' })).toHaveValue('single'); // remembered on this device
  });

  test('distraction-free: F hides the chrome; Esc or the top edge brings it back', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await openDoc(page, '01-single-column-prose.pdf');
    const toolbar = page.getByRole('toolbar', { name: 'Reader toolbar' });
    await page.keyboard.press('f');
    await expect(toolbar).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(toolbar).toBeVisible();
    await page.getByRole('button', { name: 'Distraction-free reading (F)' }).click();
    await expect(toolbar).toBeHidden();
    await page.mouse.move(400, 1);
    await expect(toolbar).toBeVisible();
  });
});
