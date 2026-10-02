import { expect, test } from '@playwright/test';

test.describe('app shell + chrome themes (T-101, FR-THM-01/07)', () => {
  test('theme menu switches the chrome theme and meta theme-color, keyboard only', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Theme' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitemradio', { name: 'Dark' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1B1B1B');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 27, 27)');

    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Warm' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#EFE6CF');
  });

  test('chosen theme persists across reloads (Dexie settings, T-104)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Warm' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('marginalia');
          req.onsuccess = () => {
            const get = req.result.transaction('meta').objectStore('meta').get('settings');
            get.onsuccess = () => resolve((get.result as { value: { settings: { theme: string } } }).value.settings.theme);
          };
        }),
    );
    expect(stored).toBe('warm');
  });

  test('System follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('unknown routes show the not-found screen with a way back', async ({ page }) => {
    await page.goto('/nope');
    await expect(page.getByRole('alert')).toContainText('Page not found');
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('skip link moves focus to main content', async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, 'keyboard-only');
    // Safari keeps links out of the Tab order by default (Option+Tab); not reproducible in Playwright WebKit
    test.skip(browserName === 'webkit', 'Safari link tabbing is a user preference');
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});
