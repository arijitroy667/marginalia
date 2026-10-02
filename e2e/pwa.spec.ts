import { expect, test } from '@playwright/test';
import { addViaPicker } from './helpers';

test.describe('PWA (T-111, PRD §8.9)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'service worker + CDP installability checks in Chromium');

  test('manifest is complete and Chrome reports it installable', async ({ page }) => {
    await page.goto('/');
    const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as Record<string, unknown> & { icons: { sizes: string; purpose?: string }[] };
    expect(manifest).toMatchObject({ name: 'Marginalia', short_name: 'Marginalia', id: '/', start_url: '/', display: 'standalone' });
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
    expect(installabilityErrors).toEqual([]);
  });

  test('precaches the shell and PDF.js assets; opens a PDF offline', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
      return urls;
    });
    expect(cached).toEqual(expect.arrayContaining(['/index.html']));
    expect(cached.some((u) => u.startsWith('/pdfjs/cmaps/'))).toBe(true);
    expect(cached.some((u) => u.startsWith('/pdfjs/standard_fonts/'))).toBe(true);
    expect(cached.some((u) => /pdf\.worker/.test(u))).toBe(true);

    await addViaPicker(page, '01-single-column-prose.pdf');
    await expect(page.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible();
    await page.reload(); // now controlled by the service worker
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible();
    await page.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
    await expect(page.locator('.page[data-page-number="1"] .textLayer span').first()).toBeAttached();
    await context.setOffline(false);
  });
});
