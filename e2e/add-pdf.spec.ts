import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addViaPicker, fixture, idb, noIdbBlobs, sha256 } from './helpers';

const PROSE = '01-single-column-prose.pdf';

test.describe('add PDF pipeline (T-105, FR-LIB-01..03)', () => {
  test.beforeEach(async ({ page }) => page.goto('/'));
  const STORES_BLOB = ['adds a PDF', 'same bytes', 'right one adds', 'drag and drop', 'truncated'];
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      noIdbBlobs(browserName) && STORES_BLOB.some((t) => info.title.includes(t)),
      'WinCairo WebKit: no IndexedDB Blobs',
    );
  });

  test('adds a PDF: hash, metadata, cover, local file, outbox', async ({ page }) => {
    await addViaPicker(page, PROSE);
    await expect(page.getByText('Added “01-single-column-prose”', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '01-single-column-prose' })).toBeVisible();

    const [doc] = await idb<Record<string, unknown>>(page, 'documents');
    expect(doc).toMatchObject({
      contentHash: sha256(PROSE),
      pageCount: 6,
      storageMode: 'cloud',
      deletedAt: null,
      fileSize: readFileSync(fixture(PROSE)).length,
    });
    const [file] = await idb<{ size: number; blob: { size: number } }>(page, 'files');
    expect(file?.blob.size).toBe(readFileSync(fixture(PROSE)).length);
    const [cover] = await idb<{ blob: { size: number; type: string } }>(page, 'covers');
    expect(cover?.blob.size).toBeLessThanOrEqual(40 * 1024);
    expect(['image/webp', 'image/jpeg']).toContain(cover?.blob.type);
    expect(await idb(page, 'outbox')).toHaveLength(1);
  });

  test('the same bytes again open the existing document instead of duplicating', async ({ page }) => {
    await addViaPicker(page, PROSE);
    await expect(page.getByText('Added “01-single-column-prose”', { exact: true })).toBeVisible();
    await addViaPicker(page, PROSE);
    await expect(page).toHaveURL(/\/read\/[0-9a-f-]{36}$/);
    expect(await idb(page, 'documents')).toHaveLength(1);
  });

  test('rejects non-PDF bytes with a clear message', async ({ page }) => {
    await addViaPicker(page, '14b-not-a-pdf.pdf');
    await expect(page.getByText('“14b-not-a-pdf.pdf” is not a PDF.', { exact: true })).toBeVisible();
    expect(await idb(page, 'documents')).toHaveLength(0);
  });

  test('password-protected: wrong password re-prompts, right one adds; never stored', async ({ page }) => {
    await addViaPicker(page, '13-password.pdf');
    const dialog = page.getByRole('dialog', { name: 'Password required' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Password').fill('nope');
    await dialog.getByRole('button', { name: 'Unlock' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Wrong password. Try again.');
    await dialog.getByLabel('Password').fill('marginalia');
    await dialog.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Added “13-password”', { exact: true })).toBeVisible();
    const dump = JSON.stringify(await Promise.all(['documents', 'meta', 'outbox'].map((s) => idb(page, s))));
    expect(dump).not.toContain('marginalia"'); // the password appears nowhere in the local DB
  });

  test('cancelling the password prompt adds nothing', async ({ page }) => {
    await addViaPicker(page, '13-password.pdf');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('“13-password.pdf” was not added: no password.', { exact: true })).toBeVisible();
    expect(await idb(page, 'documents')).toHaveLength(0);
  });

  test('drag and drop adds files (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    const bytes = [...readFileSync(fixture('06-math.pdf'))];
    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], '06-math.pdf', { type: 'application/pdf' }));
      const target = document.querySelector('main > div')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByText('Added “06-math”', { exact: true })).toBeVisible();
  });

  test('a truncated PDF never crashes the app', async ({ page }) => {
    await addViaPicker(page, '14-corrupt-truncated.pdf');
    // PDF.js may recover a truncated file (xref rebuild) or refuse it; either way the user gets an answer
    await expect(
      page.getByText(/^(Added “14-corrupt-truncated”|“14-corrupt-truncated\.pdf” could not be opened.*)$/),
    ).toBeVisible();
  });
});

test('a file the browser refuses to store is reported as a storage problem, not a damaged PDF', async ({
  page,
  browserName,
}) => {
  test.skip(!noIdbBlobs(browserName), "needs a browser that refuses IndexedDB Blobs (Playwright's WebKit)");
  await page.goto('/');
  await addViaPicker(page, '01-single-column-prose.pdf');
  await expect(page.getByText('could not be saved on this device', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('may be damaged', { exact: false })).toHaveCount(0);
});
