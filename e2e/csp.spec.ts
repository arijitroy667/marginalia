import { expect, test, type Page } from '@playwright/test';
import { noIdbBlobs, openDoc, textRows } from './helpers';

declare global {
  interface Window {
    __csp: string[];
  }
}

/** Every CSP violation the page reports, as "directive blockedURI". */
const violations = (page: Page) => page.evaluate(() => window.__csp);

test.describe('Content-Security-Policy is enforced and the app works under it (T-404, NFR-SEC-04)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`),
      );
    });
  });

  test('the built page carries a strict policy (no unsafe-eval, no inline scripts)', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("object-src 'none'");
  });

  test('reading, annotating, theming and settings produce no violations', async ({ page, browserName, isMobile }) => {
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs");
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    if (isMobile) await page.touchscreen.tap(r.x, r.y);
    else await page.mouse.click(r.x, r.y);
    await page.getByRole('button', { name: 'Highlight: Key idea' }).click();
    await page.getByRole('toolbar', { name: 'Line actions' }).getByRole('button', { name: 'Note' }).click();
    await page.keyboard.type('note under CSP');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openDoc(page, '04-slides-16x9.pdf'); // images: decoders, dark-theme image restore
    await page.locator('.page[data-page-number="3"]').evaluate((e) => e.scrollIntoView());
    await expect(page.locator('.page[data-page-number="3"] .canvasWrapper canvas').first()).toBeVisible();
    await page.waitForTimeout(800);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
