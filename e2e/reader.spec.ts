import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, docRow, idb, noIdbBlobs, seed } from './helpers';

async function open(page: Page, fixture: string, title: string) {
  await page.goto('/');
  await addViaPicker(page, fixture);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
}
const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });
const scale = (page: Page) => page.evaluate(() => Number(getComputedStyle(document.querySelector('.pdfViewer')!).getPropertyValue('--scale-factor')));

test.describe('reader shell (T-107, FR-RDR-01..03, FR-RDR-12)', () => {
  test.describe('with a stored PDF', () => {
    test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

    test('opens a PDF: pages render with a text layer; last opened is recorded', async ({ page }) => {
      await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
      await expect(page.getByText('of 6')).toBeVisible();
      await expect(pageInput(page)).toHaveValue('1');
      await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toBeAttached();
      await expect.poll(async () => (await idb<{ lastOpenedAt: string | null }>(page, 'documents'))[0]?.lastOpenedAt).not.toBeNull();
    });

    test('page navigation: buttons, page input, G, Home/End, PgUp/PgDn; invalid input ignored with feedback', async ({ page, isMobile }) => {
      await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
      if (!isMobile) {
        // phones navigate with the page field and scrubber instead (PRD §10.3, mobile.spec.ts)
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(pageInput(page)).toHaveValue('2');
      }
      await pageInput(page).fill('5');
      await pageInput(page).press('Enter');
      await expect(pageInput(page)).toHaveValue('5');
      await pageInput(page).fill('99');
      await pageInput(page).press('Enter');
      await expect(page.getByText('There is no page “99”. This document has 6 pages.', { exact: true })).toBeVisible();
      await expect(pageInput(page)).toHaveValue('5');
      if (isMobile) return; // keyboard shortcuts are desktop
      await page.keyboard.press('End');
      await expect(pageInput(page)).toHaveValue('6');
      await page.keyboard.press('Home');
      await expect(pageInput(page)).toHaveValue('1');
      await page.keyboard.press('PageDown');
      await expect(pageInput(page)).toHaveValue('2');
      await page.keyboard.press('g');
      await expect(pageInput(page)).toBeFocused();
      await page.keyboard.type('3');
      await page.keyboard.press('Enter');
      await expect(pageInput(page)).toHaveValue('3');
    });

    test('zoom: buttons, Ctrl+0, Ctrl+wheel; clamped to 50-400 %', async ({ page, isMobile }) => {
      test.skip(isMobile, 'pinch zoom is T-112');
      await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
      await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('page-width');
      const fit = await scale(page);
      await page.getByRole('combobox', { name: 'Zoom' }).selectOption('1');
      await expect.poll(() => scale(page)).toBeCloseTo(4 / 3, 2); // 100 % = 1 pt -> 96/72 CSS px
      await page.getByRole('button', { name: 'Zoom in' }).click();
      await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('1.25');
      for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
      await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('4');
      await page.keyboard.press('Control+0');
      await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('page-width');
      await expect.poll(() => scale(page)).toBeCloseTo(fit, 2);
      const box = (await page.locator('.reader-scroll').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down('Control');
      for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
      await page.keyboard.up('Control');
      await expect.poll(() => scale(page)).toBeGreaterThan(fit * 1.3);
    });

    test('a locked PDF explains itself and recovers with the password', async ({ page }) => {
      await page.goto('/');
      await addViaPicker(page, '13-password.pdf');
      await page.getByRole('dialog').getByLabel('Password').fill('marginalia');
      await page.getByRole('dialog').getByRole('button', { name: 'Unlock' }).click();
      await page.getByRole('link', { name: /13-password/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('alert')).toContainText('This PDF is locked');
      await page.getByRole('button', { name: 'Enter password' }).click();
      await page.getByRole('dialog').getByLabel('Password').fill('marginalia');
      await page.getByRole('dialog').getByRole('button', { name: 'Unlock' }).click();
      await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
    });
  });

  test('unknown document id shows not-found with a way back', async ({ page }) => {
    await page.goto('/read/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('alert')).toContainText('Document not found');
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('a document whose file is not on this device says so, with recovery actions', async ({ page }) => {
    await seed(page, { documents: [docRow(7, { title: 'Elsewhere' })] });
    await page.goto(`/read/${docRow(7).id}`);
    await expect(page.getByRole('alert')).toContainText('Not on this device yet');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to library' })).toBeVisible();
  });
});
