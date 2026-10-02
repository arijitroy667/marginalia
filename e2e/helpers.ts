import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/pdfs/${name}`, import.meta.url));
export const sha256 = (name: string) => createHash('sha256').update(readFileSync(fixture(name))).digest('hex');

/** All rows of an IndexedDB store of the app DB; Blobs come back as { blob: true, size, type }. */
export function idb<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (store) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('marginalia');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const all = open.result.transaction(store).objectStore(store).getAll();
          all.onsuccess = () => {
            const out = (all.result as Record<string, unknown>[]).map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([k, v]) => [k, v instanceof Blob ? { blob: true, size: v.size, type: v.type } : v]),
              ),
            );
            open.result.close();
            resolve(out as T[]);
          };
        };
      }),
    store,
  );
}

/** Adds files through the Add PDF button's file chooser. */
export async function addViaPicker(page: Page, ...names: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add PDF' }).click();
  await (await chooser).setFiles(names.map(fixture));
}

/**
 * Playwright's WebKit on Windows (WinCairo port) cannot store Blobs in IndexedDB (writes fail), unlike
 * Safari on macOS/iOS and WebKit on Linux CI. Tests that store a PDF skip only in that combination.
 */
export const noIdbBlobs = (browserName: string) => browserName === 'webkit' && process.platform === 'win32';
