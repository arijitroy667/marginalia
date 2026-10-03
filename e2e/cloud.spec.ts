/**
 * Against the configured Supabase project (needs .env.local; served on :4174 by playwright.config.ts).
 * Two browser contexts = two devices of one throwaway user, signed in through the token-hash link route.
 * The service-role key stays in this Node process (user setup/teardown); the browser only gets the anon key.
 */
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';
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

test.describe('cloud: auth + sync (T-103, T-300, FR-SYN-01..05)', () => {
  test.skip(!URL_ || !SERVICE, 'needs .env.local with a Supabase project');
  test.skip(
    ({ browserName, isMobile }) => noIdbBlobs(browserName) || isMobile,
    'one desktop Chromium run is enough against the live project',
  );
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let admin: ReturnType<typeof createClient>;
  let userId = '';
  const email = `e2e-${randomUUID().slice(0, 8)}@marginalia.test`;

  test.beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });
  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId); // cascades to every row
  });

  async function signIn(page: Page) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    await page.goto(`${CLOUD}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
    await expect(page.getByRole('button', { name: 'Add PDF' }).first()).toBeVisible({ timeout: 20_000 });
  }
  const device = async (browser: Browser) => (await browser.newContext({ baseURL: CLOUD })).newPage();
  const synced = (page: Page) =>
    expect(page.getByRole('status').filter({ hasText: /^Synced$/ })).toBeVisible({ timeout: 30_000 });

  test('signed out, the app sends you to sign in', async ({ browser }) => {
    const page = await device(browser);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('a highlight made on one device reaches the other; sign-out can remove local data', async ({ browser }) => {
    const a = await device(browser);
    await signIn(a);
    await addViaPicker(a, '01-single-column-prose.pdf');
    await a.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(a.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();
    const [r] = await textRows(a, 1, 8);
    await a.mouse.click(r.x, r.y);
    await a.keyboard.press('3'); // Look up
    await a.keyboard.press('Escape');
    await a.getByRole('link', { name: 'Library' }).click();
    await synced(a);
    await expect.poll(async () => (await idb(a, 'outbox')).length, { timeout: 30_000 }).toBe(0); // pushed
    await synced(a);
    const server = await admin.from('annotations').select('kind,color_id,user_id').eq('user_id', userId);
    expect(server.data).toEqual([{ kind: 'highlight', color_id: 3, user_id: userId }]);

    const b = await device(browser);
    await signIn(b);
    await expect(b.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible({ timeout: 30_000 }); // pulled
    await expect
      .poll(async () => (await idb<{ colorId: number }>(b, 'annotations')).map((h) => h.colorId), { timeout: 30_000 })
      .toEqual([3]);

    // the file itself (T-302, FR-SYN-07): uploaded by A to {user}/{hash}.pdf, downloaded and verified by B
    const [docA] = await idb<{ storagePath: string | null; contentHash: string }>(a, 'documents');
    expect(docA!.storagePath).toBe(`${userId}/${docA!.contentHash}.pdf`);
    expect(await idb(b, 'files')).toEqual([]);
    await b.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(b.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(b.locator('.page[data-page-number="1"] .mg-hl')).toHaveCount(1); // A's highlight on B's copy
    expect((await idb<{ blob: { size: number } }>(b, 'files'))[0]?.blob.size).toBeGreaterThan(1000);

    // live updates (T-304, FR-SYN-06): B keeps the book open; a highlight A makes appears without a reload
    await a.getByRole('link', { name: /01-single-column-prose/ }).click();
    await expect(a.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();
    const [r2] = await textRows(a, 1, 10);
    await a.mouse.click(r2.x, r2.y);
    await a.keyboard.press('1');
    const t0 = Date.now();
    await expect(b.locator('.page[data-page-number="1"] .mg-hl')).toHaveCount(2, { timeout: 20_000 });
    console.log(`realtime: highlight visible on B ${Date.now() - t0} ms after A's key press (push waits 1 s)`);
    await b.getByRole('link', { name: 'Library' }).click();

    // settings sync (T-306, FR-THM-06): A picks Warm and a new palette label; B gets both on its next sync
    await a.getByRole('link', { name: 'Library' }).click();
    await a.getByRole('button', { name: 'Theme' }).first().click();
    await a.getByRole('radio', { name: 'Warm' }).check();
    await a.keyboard.press('Escape');
    await expect.poll(async () => (await idb(a, 'outbox')).length, { timeout: 30_000 }).toBe(0);
    const profile = await admin.from('profiles').select('settings').eq('id', userId).single<{ settings: unknown }>();
    expect(profile.data?.settings).toMatchObject({ theme: 'warm' });
    await b.reload(); // a sync run starts with the app
    await expect(b.locator('html')).toHaveAttribute('data-theme', 'warm', { timeout: 30_000 });

    await b.getByRole('link', { name: 'Settings' }).click();
    await expect(b.getByText(`Signed in as ${email}`, { exact: false })).toBeVisible();
    await b.getByRole('button', { name: 'Sign out' }).click();
    await b.getByRole('checkbox', { name: 'Remove data from this device' }).check();
    await b.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(b).toHaveURL(/\/login$/);
    expect(await idb(b, 'documents')).toEqual([]);
    expect(await idb(b, 'annotations')).toEqual([]);
    expect((await admin.from('annotations').select('id').eq('user_id', userId)).data).toHaveLength(2); // still in the account
  });
});
