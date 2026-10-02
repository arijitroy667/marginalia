import { expect, test, type Page } from '@playwright/test';
import { noIdbBlobs, openDoc, textRows } from './helpers';

const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';
const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Annotations' });
const items = (page: Page) => panel(page).getByRole('listitem');

async function selectRow(page: Page, n: number, k: number) {
  const [r] = await textRows(page, n, k);
  await page.mouse.click(r.x, r.y);
  await expect(page.getByRole('toolbar', { name: 'Line actions' })).toBeVisible();
}

test.describe('annotation panel (T-208, FR-PNL-01, FR-NOT-04)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('tabs, grouping by page, colour chips, text filter, jump + flash, empty states', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard; phones open the same panel from the bottom bar');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page.getByRole('tab', { name: 'Highlights' }).click();
    await expect(panel(page).getByText('No highlights yet', { exact: false })).toBeVisible(); // empty state per tab

    await selectRow(page, 1, 8);
    await page.keyboard.press('1'); // Key idea
    await page.keyboard.press('n');
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('Why read slowly?');
    await page.keyboard.press(`${PRIMARY}+Enter`);
    await selectRow(page, 3, 5);
    await page.keyboard.press('2'); // Definition
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'All' }).click();
    await expect(items(page)).toHaveCount(4);
    await expect(panel(page).getByRole('region', { name: 'Page 1' }).getByRole('listitem')).toHaveCount(2);
    await expect(panel(page).getByRole('region', { name: 'Page 3' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Notes' }).click();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page)).toContainText('Why read slowly?'); // note text, with its line's colour (FR-NOT-04)
    await expect(items(page)).toContainText('Key idea');
    await page.getByRole('tab', { name: 'Bookmarks' }).click();
    await expect(items(page)).toHaveCount(1);

    await page.getByRole('tab', { name: 'All' }).click();
    await panel(page)
      .getByRole('group', { name: 'Filter by colour' })
      .getByRole('button', { name: 'Definition' })
      .click();
    await expect(items(page)).toHaveCount(1); // the green highlight; bookmarks have no colour
    await panel(page)
      .getByRole('group', { name: 'Filter by colour' })
      .getByRole('button', { name: 'Key idea' })
      .click();
    await expect(items(page)).toHaveCount(3); // + the yellow highlight and the note on its line
    await panel(page)
      .getByRole('group', { name: 'Filter by colour' })
      .getByRole('button', { name: 'Definition' })
      .click();
    await panel(page)
      .getByRole('group', { name: 'Filter by colour' })
      .getByRole('button', { name: 'Key idea' })
      .click();

    await panel(page).getByRole('searchbox', { name: 'Filter annotations' }).fill('slowly');
    await expect(items(page)).toHaveCount(1);
    await panel(page).getByRole('searchbox', { name: 'Filter annotations' }).fill('zzz-nothing');
    await expect(panel(page).getByText('Nothing matches these filters.')).toBeVisible();
    await panel(page).getByRole('searchbox', { name: 'Filter annotations' }).fill('');

    await panel(page).getByRole('region', { name: 'Page 3' }).getByRole('button').first().click();
    await expect(page.locator('.page[data-page-number="3"] .mg-flash')).toBeAttached(); // jump + pulse
  });

  test('phones: the panel opens from the bottom bar and a jump closes it', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone drawer');
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 3, 5);
    await page.touchscreen.tap(r.x, r.y);
    await page
      .getByRole('toolbar', { name: 'Line actions' })
      .getByRole('button', { name: 'Highlight: Look up' })
      .click();
    await page.locator('.reader-scroll').evaluate((el) => (el.scrollTop = 0));
    await page.getByRole('toolbar', { name: 'Page controls' }).getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await expect(items(page)).toHaveCount(1);
    await items(page).getByRole('button').click();
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveCount(0);
    await expect(page.locator('.page[data-page-number="3"] .mg-flash')).toBeAttached();
  });
});
