import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noIdbBlobs, openDoc, textRows } from './helpers';

const read = async (d: Download) => readFileSync((await d.path()), 'utf8');
async function exportFrom(page: Page, item: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: item }).click();
  return download;
}

test.describe('export (T-400, FR-EXP-01/02, FR-PNL-03)', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs");
    test.skip(isMobile, 'keyboard to annotate; the export UI is the same on phones');
  });

  test('the panel exports this book as Markdown and JSON; Settings exports everything', async ({ page }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('1');
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Annotations' }).click();

    await page.getByRole('button', { name: 'Export' }).click();
    const md = await exportFrom(page, 'Export as Markdown');
    expect(md.suggestedFilename()).toBe('01-single-column-prose.md');
    const text = await read(md);
    expect(text).toMatch(/^# 01-single-column-prose\n/);
    expect(text).toContain('## Page 1');
    expect(text).toContain('*Key idea*');
    expect(text).toMatch(/## Bookmarks\n\n- p\. 1 — /);

    await page.getByRole('button', { name: 'Export' }).click();
    const json = JSON.parse(await read(await exportFrom(page, 'Export as JSON'))) as {
      schema: number;
      annotations: { kind: string }[];
    };
    expect(json.schema).toBe(1);
    expect(json.annotations.map((a) => a.kind).sort()).toEqual(['bookmark', 'highlight']);

    await page.goto('/settings');
    const all = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export all annotations (JSON)' }).click();
    const full = JSON.parse(await read(await all)) as {
      schema: number;
      documents: unknown[];
      settings: { palette: unknown[] };
    };
    expect(full).toMatchObject({ schema: 1, documents: [{ title: '01-single-column-prose' }] });
    expect(full.settings.palette).toHaveLength(5);
  });
});
