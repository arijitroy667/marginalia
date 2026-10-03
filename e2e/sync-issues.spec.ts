import { expect, test } from '@playwright/test';
import { idb, seed } from './helpers';

const failed = (n: number) => ({
  entity: 'annotation',
  entityId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  op: 'upsert',
  payload: { body: 'private note text' },
  attempts: 1,
  status: 'failed',
  lastError: 'new row violates check constraint',
  createdAt: Date.UTC(2026, 9, 3),
});

test.describe('sync issues screen (T-305, FR-SYN-10)', () => {
  test('lists failed changes with the server error; retry, discard, export as JSON', async ({ page }) => {
    await seed(page, { outbox: [failed(1), failed(2)] });
    await page.goto('/sync-issues');
    await expect(page.getByRole('heading', { name: 'Sync issues' })).toBeVisible();
    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('new row violates check constraint');
    await expect(page.getByText('private note text')).toHaveCount(0); // payloads are never shown

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export as JSON' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^marginalia-sync-issues-\d{4}-\d{2}-\d{2}\.json$/);

    await items.first().getByRole('button', { name: 'Retry' }).click();
    await items.first().getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText('No sync issues.', { exact: false })).toBeVisible();
    const rows = await idb<{ status: string }>(page, 'outbox');
    expect(rows.map((r) => r.status)).toEqual(['pending']); // retried one waits for the next sync
  });
});
