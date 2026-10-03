import { expect, test } from '@playwright/test';
import { addViaPicker, noIdbBlobs, openDoc, textRows } from './helpers';

const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('library-wide annotation search (T-409, FR-PNL-02)', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs");
    test.skip(isMobile, 'keyboard to annotate');
  });

  test('finds notes and quotes across books; a result opens the book at that line', async ({ page }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 3, 5);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('n');
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('Remember the marginalia argument');
    await page.keyboard.press(`${PRIMARY}+Enter`);
    await page.goto('/');
    await addViaPicker(page, '02-two-column-ieee.pdf');
    await expect(page.getByRole('link', { name: /02-two-column-ieee/ })).toBeVisible();

    await page.getByRole('searchbox').first().fill('marginalia arg');
    const results = page.getByRole('region', { name: 'In your highlights, notes and bookmarks' });
    await expect(results.getByRole('link')).toHaveCount(1);
    await expect(results.getByRole('link')).toContainText('01-single-column-prose · p. 3');
    await expect(results.locator('mark')).toHaveText('marginalia arg');
    await results.getByRole('link').click();
    await expect(page.locator('.page[data-page-number="3"] .mg-flash')).toBeAttached({ timeout: 10_000 });
    await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('3');
  });
});
