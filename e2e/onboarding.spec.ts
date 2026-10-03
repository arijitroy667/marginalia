import { expect, test } from '@playwright/test';
import { noIdbBlobs, openDoc, setMeta, textRows } from './helpers';

test.describe('onboarding (T-405, PRD §10.5)', () => {
  test('first-run tips tick off as you select, highlight and note, then go away for good', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs");
    await openDoc(page, '01-single-column-prose.pdf');
    await setMeta(page, 'coachDone', false);
    await page.reload();
    const coach = page.getByRole('complementary', { name: 'Three things to try' });
    await expect(coach).toBeVisible();
    await expect(coach).toContainText(isMobile ? 'Tap a line to select it' : 'Press H to highlight it');

    const [r] = await textRows(page, 1, 8);
    if (isMobile) await page.touchscreen.tap(r.x, r.y);
    else await page.mouse.click(r.x, r.y);
    await expect(coach.getByRole('listitem').first()).toContainText('(Done)');
    await page.getByRole('button', { name: 'Highlight: Key idea' }).click();
    await expect(coach.getByRole('listitem').nth(1)).toContainText('(Done)');
    if (!(await page.getByRole('toolbar', { name: 'Line actions' }).isVisible())) {
      if (isMobile) await page.touchscreen.tap(r.x, r.y);
      else await page.mouse.click(r.x, r.y);
    }
    await page.getByRole('toolbar', { name: 'Line actions' }).getByRole('button', { name: 'Note' }).click();
    await expect(coach.getByRole('listitem').nth(2)).toContainText('(Done)');
    await expect(coach).toHaveCount(0, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();
    await expect(coach).toHaveCount(0);
  });

  test('iPhone Safari, not installed: explains Add to Home Screen; can be dismissed', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto('/');
    const banner = page.getByRole('complementary', { name: 'Add Marginalia to your Home Screen' });
    await expect(banner).toContainText('Add to Home Screen');
    await banner.getByRole('button', { name: 'Not now' }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await ctx.close();
  });

  test('the empty library invites adding a PDF', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add PDF' })).toHaveCount(2); // header + the large drop zone
  });
});
