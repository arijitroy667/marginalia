/**
 * Sync under bad conditions, against the configured Supabase project (T-305, FR-SYN-03/05/08, NFR-REL-01):
 * offline, flaky network, a tab killed mid-edit, and a client clock a day ahead. Needs .env.local (served on :4174).
 */
import { createClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { addViaPicker, idb, noIdbBlobs, textRows } from './helpers';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* skipped below */
}
const URL_ = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CLOUD = 'http://localhost:4174';
const PROSE = '01-single-column-prose.pdf';

test.describe('cloud chaos: offline, flaky, killed tab, clock skew (T-305)', () => {
  test.skip(!URL_ || !SERVICE, 'needs .env.local with a Supabase project');
  test.skip(
    ({ browserName, isMobile }) => noIdbBlobs(browserName) || isMobile,
    'desktop Chromium against the live project',
  );
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(150_000);

  let admin: ReturnType<typeof createClient>;
  let userId = '';
  const email = `chaos-${randomUUID().slice(0, 8)}@marginalia.test`;

  test.beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });
  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function signIn(page: Page) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    await page.goto(`${CLOUD}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
    await expect(page.getByRole('button', { name: 'Add PDF' }).first()).toBeVisible({ timeout: 20_000 });
  }
  const pill = (page: Page) =>
    page.getByRole('status').filter({ hasText: /Synced|Syncing|Offline|error|attention|Sign in/ });
  const drained = (page: Page) =>
    expect.poll(async () => (await idb(page, 'outbox')).length, { timeout: 60_000 }).toBe(0);
  const serverColours = async () =>
    (
      (await admin.from('annotations').select('color_id').eq('user_id', userId).is('deleted_at', null)).data as
        { color_id: number }[] | null
    )
      ?.map((r) => r.color_id)
      .sort() ?? [];

  let context: BrowserContext;
  let page: Page;

  async function openBook() {
    await page.goto(`${CLOUD}/`);
    await page.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible({
      timeout: 30_000,
    });
  }
  async function highlight(row: number, key: string) {
    const [r] = await textRows(page, 1, row);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press(key);
    await page.keyboard.press('Escape');
  }

  test('setup: one signed-in device with a synced book', async ({ browser }) => {
    context = await browser.newContext({ baseURL: CLOUD });
    page = await context.newPage();
    await signIn(page);
    await addViaPicker(page, PROSE);
    await expect(page.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible({ timeout: 30_000 }); // added
    await drained(page);
    await expect
      .poll(async () => ((await admin.from('documents').select('id').eq('user_id', userId)).data ?? []).length)
      .toBe(1);
  });

  test('offline: edits wait in the outbox, the pill says so, and they go up when the network returns', async () => {
    await openBook();
    await context.setOffline(true);
    await highlight(6, '1');
    await page.getByRole('link', { name: 'Library' }).click();
    await expect(pill(page)).toHaveText(/Offline · [0-9]+ pending/, { timeout: 20_000 }); // the highlight, plus last-opened and the reading position
    expect(await serverColours()).toEqual([]);
    await context.setOffline(false);
    await expect(pill(page)).toHaveText('Synced', { timeout: 60_000 });
    expect(await serverColours()).toEqual([1]);
  });

  test('flaky network: failed writes back off and retry; nothing is lost or duplicated', async () => {
    let failures = 2;
    await context.route(`${URL_}/rest/v1/annotations*`, (route) =>
      route.request().method() === 'POST' && failures-- > 0
        ? route.fulfill({ status: 503, body: '{"message":"unavailable"}' })
        : route.continue(),
    );
    await openBook();
    await highlight(8, '2');
    await drained(page);
    expect(failures).toBeLessThan(0); // both injected failures were hit, then the retry went through
    expect(await serverColours()).toEqual([1, 2]);
    await context.unroute(`${URL_}/rest/v1/annotations*`);
  });

  test('a tab closed right after an edit loses nothing: the outbox pushes on the next start', async () => {
    await openBook();
    const before = await page.locator('.mg-hl').count();
    await highlight(10, '3');
    await expect(page.locator('.mg-hl')).toHaveCount(before + 1); // the user sees it: saved locally, not yet pushed
    await page.close(); // inside the 1 s push delay
    page = await context.newPage();
    await page.goto(`${CLOUD}/`);
    await drained(page);
    expect(await serverColours()).toEqual([1, 2, 3]);
  });

  test("a client clock a day ahead cannot win: the later write wins by the server's clock", async ({ browser }) => {
    await page.clock.install({ time: new Date(Date.now() + 24 * 3600 * 1000) }); // device A: clock 1 day ahead
    await openBook();
    await highlight(6, '4'); // A recolours the first highlight (1 -> 4) "tomorrow"
    await drained(page);
    const other = await (await browser.newContext({ baseURL: CLOUD })).newPage(); // device B: correct clock
    await signIn(other);
    await expect.poll(async () => (await idb(other, 'annotations')).length, { timeout: 30_000 }).toBe(3);
    await other.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(other.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible({
      timeout: 30_000,
    });
    page = other;
    await highlight(6, '5'); // B recolours the same line afterwards (4 -> 5)
    await drained(other);
    expect(await serverColours()).toEqual([2, 3, 5]);
  });

  test('M3 exit: the same PDF added on two offline devices becomes one document (FR-SYN-09)', async ({ browser }) => {
    const email2 = `dup-${randomUUID().slice(0, 8)}@marginalia.test`;
    const { data: created } = await admin.auth.admin.createUser({ email: email2, email_confirm: true });
    const uid = created.user!.id;
    try {
      // one after the other: a new magic link for the same user invalidates the previous one
      const devices: { ctx: BrowserContext; pg: Page }[] = [];
      for (let k = 0; k < 2; k++) {
        devices.push(
          await (async () => {
            const ctx = await browser.newContext({ baseURL: CLOUD });
            const pg = await ctx.newPage();
            const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: email2 });
            await pg.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
            await expect(pg.getByRole('button', { name: 'Add PDF' }).first()).toBeVisible({ timeout: 20_000 });
            // offline needs the app cached: wait until the service worker controls this first-visit page
            await pg.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
            await ctx.setOffline(true);
            await addViaPicker(pg, PROSE);
            await expect(pg.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible();
            return { ctx, pg };
          })(),
        );
      }
      const ids = await Promise.all(devices.map(async (d) => (await idb<{ id: string }>(d.pg, 'documents'))[0]!.id));
      expect(ids[0]).not.toBe(ids[1]); // two local ids for the same bytes
      for (const d of devices) {
        await d.ctx.setOffline(false);
        await d.pg.reload(); // sync on start
        await expect.poll(async () => (await idb(d.pg, 'outbox')).length, { timeout: 60_000 }).toBe(0);
      }
      const docs = (await admin.from('documents').select('id').eq('user_id', uid)).data as { id: string }[];
      expect(docs).toHaveLength(1);
      for (const d of devices) {
        await d.pg.reload();
        await expect
          .poll(async () => (await idb<{ id: string }>(d.pg, 'documents')).map((x) => x.id), { timeout: 30_000 })
          .toEqual([docs[0]!.id]);
      }
    } finally {
      await admin.auth.admin.deleteUser(uid);
    }
  });

  test('M3 exit: 100 offline edits on each of two devices merge after reconnect', async ({ browser }) => {
    const email3 = `merge-${randomUUID().slice(0, 8)}@marginalia.test`;
    const { data: created } = await admin.auth.admin.createUser({ email: email3, email_confirm: true });
    const uid = created.user!.id;
    try {
      const signedIn = async () => {
        const ctx = await browser.newContext({ baseURL: CLOUD });
        const pg = await ctx.newPage();
        const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: email3 });
        await pg.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
        await expect(pg.getByRole('button', { name: 'Add PDF' }).first()).toBeVisible({ timeout: 20_000 });
        return { ctx, pg };
      };
      const a = await signedIn();
      await addViaPicker(a.pg, PROSE);
      await expect(a.pg.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible();
      await expect.poll(async () => (await idb(a.pg, 'outbox')).length, { timeout: 60_000 }).toBe(0);
      const b = await signedIn();
      await expect.poll(async () => (await idb(b.pg, 'documents')).length, { timeout: 30_000 }).toBe(1);
      const docId = (await idb<{ id: string }>(a.pg, 'documents'))[0]!.id;

      // both offline; 100 note edits each, written exactly as the repositories do (row + outbox, one transaction)
      for (const [d, tag] of [
        [a, 'A'],
        [b, 'B'],
      ] as const) {
        await d.ctx.setOffline(true);
        await d.pg.evaluate(
          ({ docId, tag }) =>
            new Promise<void>((resolve, reject) => {
              const open = indexedDB.open('marginalia');
              open.onsuccess = () => {
                const tx = open.result.transaction(['annotations', 'outbox'], 'readwrite');
                const t = new Date().toISOString();
                for (let i = 0; i < 100; i++) {
                  const row = {
                    id: crypto.randomUUID(),
                    documentId: docId,
                    kind: 'note',
                    page: 1 + (i % 6),
                    anchor: {
                      v: 1,
                      page: 1 + (i % 6),
                      rects: [{ x: 0.1, y: (i % 40) / 41, w: 0.8, h: 0.02 }],
                      quote: { exact: '', prefix: '', suffix: '' },
                    },
                    colorId: null,
                    body: `${tag}-${i}`,
                    label: null,
                    createdAt: t,
                    updatedAt: t,
                    deletedAt: null,
                    localUpdatedAt: Date.now(),
                  };
                  tx.objectStore('annotations').put(row);
                  tx.objectStore('outbox').add({
                    entity: 'annotation',
                    entityId: row.id,
                    op: 'upsert',
                    payload: row,
                    attempts: 0,
                    status: 'pending',
                    createdAt: Date.now(),
                  });
                }
                tx.oncomplete = () => (open.result.close(), resolve());
                tx.onerror = () => reject(new Error(String(tx.error)));
              };
            }),
          { docId, tag },
        );
      }
      for (const d of [a, b]) await d.ctx.setOffline(false);
      for (const d of [a, b]) await d.pg.reload(); // reconnect: push, then pull
      for (const d of [a, b])
        await expect.poll(async () => (await idb(d.pg, 'outbox')).length, { timeout: 90_000 }).toBe(0);
      const server = (await admin.from('annotations').select('body').eq('user_id', uid)).data as { body: string }[];
      expect(server).toHaveLength(200);
      for (const d of [a, b]) {
        await d.pg.reload();
        await expect
          .poll(async () => (await idb<{ body: string }>(d.pg, 'annotations')).map((n) => n.body).sort(), {
            timeout: 60_000,
          })
          .toEqual(server.map((n) => n.body).sort());
      }
    } finally {
      await admin.auth.admin.deleteUser(uid);
    }
  });
});
