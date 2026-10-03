import { expect, test } from '@playwright/test';
import { statSync } from 'node:fs';
import { docRow, fixture, noIdbBlobs, seed, sha256 } from './helpers';

const PROSE = '01-single-column-prose.pdf';

test.describe('opening a book whose file is elsewhere (T-302, FR-LIB-05/06)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs"));

  test('a device-only book asks for the file and accepts only the same bytes', async ({ page }) => {
    const row = docRow(1, {
      contentHash: sha256(PROSE),
      storageMode: 'device',
      fileSize: statSync(fixture(PROSE)).size,
      pageCount: 6,
    });
    await seed(page, { documents: [row] });
    await page.goto(`/read/${row.id}`);
    await expect(page.getByText('Attach the same PDF to read it', { exact: false })).toBeVisible();

    const pick = async (name: string) => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Attach file' }).click();
      await (await chooser).setFiles(fixture(name));
    };
    await pick('02-two-column-ieee.pdf');
    await expect(page.getByText('That file is not the same PDF', { exact: false })).toBeVisible();
    await pick(PROSE);
    await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();
  });
});
