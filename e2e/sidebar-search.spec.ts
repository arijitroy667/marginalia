import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, noIdbBlobs } from './helpers';

async function open(page: Page, fixture: string, title: string) {
  await page.goto('/');
  await addViaPicker(page, fixture);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
}
const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' });

async function ensureSidebar(page: Page) {
  if (!(await sidebar(page).isVisible())) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(sidebar(page)).toBeVisible();
}

test.describe('sidebar + search (T-108, FR-RDR-04..06)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('thumbnails render lazily, mark the current page and jump on click', async ({ page }) => {
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    await ensureSidebar(page);
    const thumbs = sidebar(page).getByRole('button', { name: /^Page \d+$/ });
    await expect(thumbs).toHaveCount(6);
    await expect(sidebar(page).getByRole('button', { name: 'Page 1' }).locator('img')).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    await sidebar(page).getByRole('button', { name: 'Page 4' }).click();
    await expect(pageInput(page)).toHaveValue('4');
    await ensureSidebar(page); // phones close the drawer after a jump
    await expect(sidebar(page).getByRole('button', { name: 'Page 4' })).toHaveAttribute('aria-current', 'page');
  });

  test('S toggles the sidebar (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    const before = await sidebar(page).isVisible();
    await page.keyboard.press('s');
    await expect(sidebar(page)).toBeVisible({ visible: !before });
  });

  test('Contents tab: hidden without an outline, nested and navigable with one', async ({ page }) => {
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    await ensureSidebar(page);
    await expect(sidebar(page).getByRole('tab', { name: 'Pages' })).toBeVisible();
    await expect(sidebar(page).getByRole('tab', { name: 'Contents' })).toHaveCount(0);

    await open(page, '16-outline-links.pdf', '16-outline-links');
    await ensureSidebar(page);
    await sidebar(page).getByRole('tab', { name: 'Contents' }).click();
    await expect(sidebar(page).getByRole('button', { name: 'Section 2.1' })).toBeVisible();
    await sidebar(page).getByRole('button', { name: 'Chapter 4' }).click();
    await expect(pageInput(page)).toHaveValue('4');
  });

  test('find: Ctrl/Cmd+F and /, counts, Enter / Shift+Enter, no match, Esc clears', async ({ page, isMobile }) => {
    await open(page, '01-single-column-prose.pdf', '01-single-column-prose');
    if (isMobile) await page.getByRole('button', { name: 'Find in document' }).click();
    else await page.keyboard.press('ControlOrMeta+f');
    const box = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(box).toBeFocused();
    await box.fill('river');
    const status = page.getByRole('search').getByRole('status');
    await expect(status).toHaveText(/^1 of \d+$/);
    await box.press('Enter');
    await expect(status).toHaveText(/^2 of \d+$/);
    await box.press('Shift+Enter');
    await expect(status).toHaveText(/^1 of \d+$/);
    await expect(page.locator('.textLayer .highlight').first()).toBeVisible(); // outlined hit
    await box.fill('zzzqqq');
    await expect(status).toHaveText('No matches');
    await box.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(page.locator('.textLayer .highlight')).toHaveCount(0);
    if (isMobile) return;
    await page.locator('.reader-scroll').focus();
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Find in document' })).toBeFocused();
  });
});
