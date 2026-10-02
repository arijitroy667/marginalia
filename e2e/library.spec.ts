import { expect, test, type Page } from '@playwright/test';
import { docRow, seed } from './helpers';

const titles = async (page: Page) =>
  page.getByRole('list', { name: 'Library' }).getByRole('link').evaluateAll((els) => els.map((e) => e.querySelector('p')?.textContent));

test.describe('library screen (T-106, FR-LIB-04)', () => {
  test('empty state explains how to add a PDF', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add PDF' })).toHaveCount(2);
  });

  test('sorts, searches, toggles layout and shows progress', async ({ page }) => {
    await seed(page, {
      documents: [
        docRow(1, { title: 'Zebra field guide', lastOpenedAt: '2026-09-20T10:00:00.000Z' }),
        docRow(2, { title: 'Algèbre linéaire', lastOpenedAt: '2026-09-30T10:00:00.000Z' }),
        docRow(3, { title: 'Moby Dick' }),
      ],
      positions: [{ documentId: docRow(2).id, page: 4, anchor: null, progress: 0.42, deviceId: 'd', deviceLabel: null, updatedAt: '2026-09-30T10:00:00.000Z', localUpdatedAt: 0 }],
    });
    await expect.poll(() => titles(page)).toEqual(['Algèbre linéaire', 'Zebra field guide', 'Moby Dick']); // last opened
    await page.getByLabel('Sort').selectOption('title');
    await expect.poll(() => titles(page)).toEqual(['Algèbre linéaire', 'Moby Dick', 'Zebra field guide']);
    await page.getByLabel('Sort').selectOption('added');
    await expect.poll(() => titles(page)).toEqual(['Moby Dick', 'Algèbre linéaire', 'Zebra field guide']);

    await page.getByRole('searchbox', { name: 'Search titles' }).fill('ALGEBRE');
    await expect.poll(() => titles(page)).toEqual(['Algèbre linéaire']);
    await expect(page.getByRole('link', { name: /Algèbre linéaire/ })).toContainText('42% read');
    await page.getByRole('searchbox', { name: 'Search titles' }).fill('nothing here');
    await expect(page.getByText('No titles match “nothing here”.')).toBeVisible();

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Sort')).toHaveValue('added');
  });

  test('500 documents render and scroll without jank', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'performance budget measured in Chromium');
    await seed(page, { documents: Array.from({ length: 500 }, (_, i) => docRow(i + 1)) });
    const t0 = Date.now();
    await expect(page.getByRole('list', { name: 'Library' }).getByRole('listitem')).toHaveCount(500);
    const renderMs = Date.now() - t0;
    const frames = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const main = document.querySelector('main')!;
          const times: number[] = [];
          let last = performance.now();
          const step = (t: number) => {
            times.push(t - last);
            last = t;
            main.scrollTop += 120;
            if (main.scrollTop + main.clientHeight < main.scrollHeight - 1 && times.length < 600) requestAnimationFrame(step);
            else resolve(times.slice(1));
          };
          requestAnimationFrame(step);
        }),
    );
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    console.log(`500 docs: list visible ${renderMs} ms; scroll frames ${frames.length}, p95 ${p95.toFixed(1)} ms, max ${sorted.at(-1)?.toFixed(1)} ms`);
    expect(renderMs).toBeLessThan(3000);
    expect(p95).toBeLessThan(25);
  });
});
