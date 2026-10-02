import { expect, test } from '@playwright/test';

test('app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Marginalia');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
