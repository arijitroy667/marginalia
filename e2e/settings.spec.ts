import { expect, test, type Page } from '@playwright/test';
import { noIdbBlobs, openDoc, textRows } from './helpers';

const section = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('settings screens (T-401, FR-SET-01/02, FR-HLT-02, FR-KEY-04)', () => {
  test('palette: rename, recolour with a contrast warning, remove with Undo', async ({ page }) => {
    await page.goto('/settings');
    const palette = section(page, 'Highlight colours');
    await expect(palette.getByRole('textbox', { name: /Meaning of colour/ })).toHaveCount(5);
    const first = palette.getByRole('textbox', { name: 'Meaning of colour 1' });
    await first.fill('Big idea');
    await first.blur();
    await expect(palette.getByRole('textbox', { name: 'Colour for Big idea' })).toBeAttached();

    await palette.getByRole('textbox', { name: 'Colour for Big idea' }).fill('#222222'); // too dark: text unreadable
    await expect(palette.getByText(/hard to read in: .*Light/)).toBeVisible();
    await palette.getByRole('textbox', { name: 'Colour for Big idea' }).fill('#ffe066');
    await expect(palette.getByText(/hard to read/)).toHaveCount(0);

    await palette.getByRole('button', { name: 'Remove Revisit' }).click();
    await expect(palette.getByRole('textbox', { name: /Meaning of colour/ })).toHaveCount(4);
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(palette.getByRole('textbox', { name: /Meaning of colour/ })).toHaveCount(5);
    await page.reload();
    await expect(section(page, 'Highlight colours').getByRole('textbox', { name: 'Meaning of colour 1' })).toHaveValue(
      'Big idea',
    );
  });

  test('shortcuts: refuse modifier-only, chords and conflicts; a remap works in the reader; reset', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard');
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs (reader part)");
    await page.goto('/settings');
    const keys = section(page, 'Keyboard shortcuts');
    const bookmark = keys.getByRole('button', { name: /^Bookmark the line, or the reading line: B/ });
    await bookmark.click();
    await page.keyboard.press('Control');
    await expect(keys.getByRole('alert')).toContainText('cannot be a shortcut');
    await page.keyboard.press('Control+m');
    await expect(keys.getByRole('alert')).toContainText('without Ctrl, Alt or Cmd');
    await page.keyboard.press('h');
    await expect(keys.getByRole('alert')).toContainText('already used for “Highlight with the active colour”');
    await page.keyboard.press('m');
    await expect(keys.getByRole('button', { name: /^Bookmark the line, or the reading line: M/ })).toBeVisible();

    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('b'); // the old key does nothing now
    await expect(page.locator('.mg-ribbon')).toHaveCount(0);
    await page.keyboard.press('m');
    await expect(page.locator('.mg-ribbon')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+?');
    await expect(
      page.getByRole('dialog', { name: 'Keyboard shortcuts' }).locator('kbd', { hasText: /^M$/ }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/settings');
    await section(page, 'Keyboard shortcuts').getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(
      section(page, 'Keyboard shortcuts').getByRole('button', { name: /^Bookmark the line, or the reading line: B/ }),
    ).toBeVisible();
  });

  test('reading defaults: default zoom applies when a book opens; cache budget persists', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs (reader part)");
    await page.goto('/settings');
    await section(page, 'Reading').getByRole('radio', { name: 'Fit page' }).check();
    await section(page, 'Storage').getByRole('combobox', { name: 'Books' }).selectOption('10');
    await page.reload();
    await expect(section(page, 'Storage').getByRole('combobox', { name: 'Books' })).toHaveValue('10');
    await openDoc(page, '01-single-column-prose.pdf');
    if (!isMobile) await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('page-fit');
    else
      expect(
        await page.locator('.pdfViewer').evaluate((el) => getComputedStyle(el).getPropertyValue('--scale-factor')),
      ).not.toBe('');
  });
});
