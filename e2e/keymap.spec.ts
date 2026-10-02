import { expect, test, type Page } from '@playwright/test';
import { idb, noIdbBlobs, openDoc } from './helpers';

const bookmarks = async (page: Page) =>
  (await idb<{ kind: string; deletedAt: string | null }>(page, 'annotations')).filter(
    (a) => a.kind === 'bookmark' && !a.deletedAt,
  );
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('keymap router, cheat sheet, gesture map (T-210, FR-KEY-01..03, 05)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('? opens the cheat sheet from the keymap; it is modal for shortcuts; Esc closes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.keyboard.press('Shift+?');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('region', { name: 'Annotate' })).toContainText(
      'Bookmark the line, or the reading line',
    );
    await expect(sheet(page).locator('kbd', { hasText: /^B$/ })).toBeVisible();
    await expect(sheet(page).locator('kbd', { hasText: /^(Ctrl|⌘)\+Shift\+Z$/ })).toBeVisible();
    await expect(sheet(page).getByRole('region', { name: 'Touch' })).toContainText('Swipe up on the bottom bar');
    await page.keyboard.press('b'); // no shortcut behind the dialog
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    expect(await bookmarks(page)).toEqual([]);
  });

  test('single keys stay out of text fields and IME composition (FR-KEY-02)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await page.keyboard.press(`${PRIMARY}+f`);
    const find = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(find).toBeFocused();
    await page.keyboard.type('bnh');
    await expect(find).toHaveValue('bnh');
    await page.keyboard.press('Escape');
    await page
      .locator('.reader-scroll')
      .evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', isComposing: true, bubbles: true })));
    await page.waitForTimeout(300);
    expect(await bookmarks(page)).toEqual([]);
    await page.locator('.reader-scroll').focus();
    await page.keyboard.press('b'); // the same key outside a field does act
    await expect.poll(async () => (await bookmarks(page)).length).toBe(1);
  });

  test('T opens the theme popover, Shift+T cycles the theme', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await page.emulateMedia({ colorScheme: 'light' });
    await openDoc(page, '01-single-column-prose.pdf');
    await page.keyboard.press('t');
    await expect(page.getByRole('dialog', { name: 'Theme' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Theme' })).toHaveCount(0);
    await page.locator('.reader-scroll').focus();
    await page.keyboard.press('Shift+T');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
    await expect(page.getByText('Theme: Warm', { exact: true })).toBeVisible();
    await page.keyboard.press('Shift+T');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('phones: swipe up on the bottom bar opens the panel sheet on Annotations; the grabber resizes and closes it', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!isMobile || browserName !== 'chromium', 'real touch events via CDP');
    await openDoc(page, '01-single-column-prose.pdf');
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x: number, y0: number, y1: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= 6; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 6 }],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const bar = page.getByRole('toolbar', { name: 'Page controls' });
    const b = (await bar.getByRole('button', { name: 'Quick bookmark' }).boundingBox())!;
    await swipe(b.x + b.width / 2, b.y + b.height / 2, b.y - 120);
    const panel = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('tab', { name: 'Annotations' })).toHaveAttribute('aria-selected', 'true');
    expect(await bookmarks(page)).toEqual([]); // the swipe was not a tap on Quick bookmark

    const handle = panel.getByRole('button', { name: 'Resize panel' });
    const before = (await panel.boundingBox())!.height;
    await handle.tap(); // tap: full height
    await expect(handle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(before + 50);
    for (const expanded of ['false', null]) {
      // drag down: back to half height, then closed
      await page.waitForTimeout(300); // let the 200 ms height transition settle before aiming at the grabber
      const h = (await handle.boundingBox())!;
      await swipe(h.x + h.width / 2, h.y + h.height / 2, h.y + h.height / 2 + 90);
      if (expanded) await expect(handle).toHaveAttribute('aria-expanded', expanded);
    }
    await expect(panel).toHaveCount(0);
  });
});
