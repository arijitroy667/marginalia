import { createClient } from '@supabase/supabase-js';
import { devices, expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { addViaPicker, textRows } from './helpers';

process.loadEnvFile('.env.local');
const CLOUD = 'http://localhost:4174';
test.setTimeout(180_000);

test('synced book on a phone: tap line → highlight / bookmark', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium');
  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `e2e-${randomUUID().slice(0, 8)}@marginalia.test`;
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  const signIn = async (page: Page) => {
    const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    await page.goto(`${CLOUD}/auth/confirm?token_hash=${data.properties!.hashed_token}&type=magiclink`);
    await expect(page.getByRole('button', { name: 'Add PDF' }).first()).toBeVisible({ timeout: 20_000 });
  };
  try {
    const desk = await (await browser.newContext({ baseURL: CLOUD })).newPage();
    await signIn(desk);
    await addViaPicker(desk, '01-single-column-prose.pdf');
    await expect(desk.getByRole('status').filter({ hasText: /^Synced$/ })).toBeVisible({ timeout: 60_000 });
    await desk.waitForTimeout(3000);

    const phone = await (await browser.newContext({ ...devices['Pixel 7'], baseURL: CLOUD })).newPage();
    const logs: string[] = [];
    phone.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    phone.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    await signIn(phone);
    await phone.getByRole('link', { name: /01-single-column-prose/ }).first().click({ timeout: 60_000 });
    await phone.locator('.textLayer span').first().waitFor({ timeout: 60_000 });
    await phone.waitForTimeout(1500);
    const [r] = await textRows(phone, 1, 8);
    await phone.touchscreen.tap(r!.x, r!.y);
    await phone.waitForTimeout(800);
    await phone.getByRole('button', { name: /^Highlight/ }).first().tap();
    await phone.waitForTimeout(1500);
    await phone.screenshot({ path: 'test-results/synced-phone.png' });
    const hl = await phone.locator('.mg-hl').count();
    console.log('highlights', hl, '\n' + logs.join('\n'));
    expect(hl).toBeGreaterThan(0);
  } finally {
    await admin.auth.admin.deleteUser(u.user!.id);
  }
});
