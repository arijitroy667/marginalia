import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { addViaPicker, fixture } from './helpers';

// NFR-PERF-01/02 on the 520-page, ~33 MB fixture (generate with `python fixtures/generate.py --large`).
const LARGE = '12-large-500p.pdf';

async function scrollFrames(page: Page, ms: number): Promise<number[]> {
  return page.locator('.reader-scroll').evaluate(
    (el, ms) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const t0 = performance.now();
        let last = t0;
        const step = (t: number) => {
          times.push(t - last);
          last = t;
          el.scrollTop += 60; // ~3600 px/s
          if (t - t0 < ms) requestAnimationFrame(step);
          else resolve(times.slice(1));
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { fps: +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1), p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(1) };
};

test.describe('performance budgets (M1 exit: NFR-PERF-01/02)', () => {
  // opt-in (PERF=1 pnpm e2e e2e/perf.spec.ts): adds a 33 MB file per project
  test.skip(({ browserName }) => !process.env.PERF || browserName !== 'chromium' || !existsSync(fixture(LARGE)), 'PERF=1, Chromium, large fixture');
  test.setTimeout(180_000);

  for (const cpu of [1, 4]) {
    test(`open + scroll a 520-page PDF at ${cpu}x CPU`, async ({ page, isMobile }) => {
      await page.goto('/');
      await addViaPicker(page, LARGE);
      await expect(page.getByRole('link', { name: /12-large-500p/ })).toBeVisible({ timeout: 60_000 });
      if (cpu > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
      const t0 = Date.now();
      await page.getByRole('link', { name: /12-large-500p/ }).click();
      await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible({ timeout: 20_000 });
      await page.locator('.page[data-page-number="1"] .canvasWrapper canvas').evaluate((c: HTMLCanvasElement) => c.width > 0);
      const firstPageMs = Date.now() - t0;
      const scroll = stats(await scrollFrames(page, 3000));
      console.log(`PERF ${isMobile ? 'pixel' : 'desktop'} cpu${cpu}x: first page ${firstPageMs} ms; scroll ${scroll.fps} fps (p95 frame ${scroll.p95} ms)`);
      if (cpu === 1 && !isMobile) {
        expect(firstPageMs).toBeLessThan(1500); // NFR-PERF-01 desktop
        expect(scroll.fps).toBeGreaterThanOrEqual(55); // NFR-PERF-02 desktop (60 fps target)
      }
    });
  }
});
