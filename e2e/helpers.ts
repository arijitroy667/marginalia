import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/pdfs/${name}`, import.meta.url));
export const sha256 = (name: string) =>
  createHash('sha256')
    .update(readFileSync(fixture(name)))
    .digest('hex');

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
                Object.entries(row).map(([k, v]) => [
                  k,
                  v instanceof Blob ? { blob: true, size: v.size, type: v.type } : v,
                ]),
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
  await page.getByRole('button', { name: 'Add PDF' }).first().click(); // empty library shows a second one
  await (await chooser).setFiles(names.map(fixture));
  await setMeta(page, 'coachDone', true); // first-run tips would cover click targets; e2e/onboarding.spec.ts tests them
}

/** Write a device-local flag into the app DB's meta store. */
export function setMeta(page: Page, key: string, value: unknown) {
  return page.evaluate(
    ({ key, value }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('marginalia');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key, value });
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(new Error(String(tx.error)));
        };
      }),
    { key, value },
  );
}

/**
 * Playwright's WebKit cannot store Blobs in IndexedDB in its ephemeral browser contexts, on Windows and on Linux
 * alike (verified 2026-10-03, Playwright 1.63: strings and ArrayBuffers store, Blobs abort the transaction).
 * Safari on macOS/iOS does store them. Tests that store a PDF skip in WebKit; real-device QA covers Safari.
 */
export const noIdbBlobs = (browserName: string) => browserName === 'webkit';

/** Seed rows straight into the app DB (Dexie creates the schema on first visit), then reload. */
export async function seed(page: Page, stores: Record<string, unknown[]>) {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('h1') !== null);
  await page.evaluate(
    (stores) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('marginalia');
        open.onsuccess = () => {
          const tx = open.result.transaction(Object.keys(stores), 'readwrite');
          for (const [name, rows] of Object.entries(stores)) for (const r of rows) tx.objectStore(name).put(r);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(new Error(String(tx.error)));
        };
      }),
    stores,
  );
  await page.reload();
}

/** A valid local document row (see src/core/db/models.ts). */
export function docRow(i: number, over: Record<string, unknown> = {}) {
  const iso = (d: number) => new Date(Date.UTC(2026, 8, 1) + d * 3_600_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    contentHash: i.toString(16).padStart(64, '0'),
    title: `Document ${i}`,
    author: null,
    pageCount: 10,
    fileSize: 1000,
    storageMode: 'cloud',
    storagePath: null,
    coverPath: null,
    lastOpenedAt: null,
    createdAt: iso(i),
    updatedAt: iso(i),
    deletedAt: null,
    localUpdatedAt: 0,
    ...over,
  };
}

/** Adds a fixture through the picker and opens it in the reader, first page rendered. */
export async function openDoc(page: Page, fixture: string) {
  await page.goto('/');
  await addViaPicker(page, fixture);
  await page.getByRole('link', { name: new RegExp(fixture.replace('.pdf', '')) }).click();
  await page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first().waitFor();
  await page.waitForTimeout(400); // initial fit + resume scroll settle
}

/** Span index starting each distinct visual row of text on a page, top to bottom. */
const rowSpans = (page: Page, n: number) =>
  page.locator(`.page[data-page-number="${n}"] .textLayer span[role="presentation"]`).evaluateAll((els) => {
    const out = new Map<number, number>();
    els.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      const key = Math.round((r.top + (window.scrollY || 0)) / 4);
      if (r.width >= 4 && !out.has(key)) out.set(key, i);
    });
    return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  });
type Pt = { x: number; y: number };
/**
 * Centres of rows `ks` of page `n`, after scrolling the first one to the middle of the viewport
 * (clear of the bottom toast area; measured after the scroll so the points are current).
 */
export async function textRows<K extends number[]>(page: Page, n: number, ...ks: K): Promise<{ [I in keyof K]: Pt }> {
  const spans = page.locator(`.page[data-page-number="${n}"] .textLayer span[role="presentation"]`);
  if ((await spans.count()) === 0) {
    // PDF.js renders text layers only near the viewport
    await page.locator(`.page[data-page-number="${n}"]`).evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await spans.first().waitFor();
  }
  const idx = await rowSpans(page, n);
  await spans.nth(idx.at(ks[0]!)!).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const pts = await Promise.all(
    ks.map(async (k) => {
      const r = (await spans.nth(idx.at(k)!).boundingBox())!;
      return { x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2 };
    }),
  );
  return pts as { [I in keyof K]: Pt };
}
