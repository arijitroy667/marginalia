import { expect, test, type Page } from '@playwright/test';
import { idb, noIdbBlobs, openDoc, textRows } from './helpers';

interface Row {
  kind: string;
  colorId: number | null;
  deletedAt: string | null;
  anchor: { rects: unknown[]; quote: { exact: string } };
}
const live = async (page: Page, kind: string) =>
  (await idb<Row>(page, 'annotations')).filter((a) => a.kind === kind && !a.deletedAt);
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Line actions' });
const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('P1 batch (T-211)', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs');
    test.skip(isMobile, 'keyboard / mouse features');
  });

  test('Shift+arrows extend the line selection into one multi-rect anchor (FR-LIN-05)', async ({ page }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 6);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('.page[data-page-number="1"] .mg-selected')).toHaveCount(3);
    await page.keyboard.press('Shift+ArrowUp');
    await expect(page.locator('.page[data-page-number="1"] .mg-selected')).toHaveCount(2);
    await page.keyboard.press('h');
    await expect.poll(async () => (await live(page, 'highlight')).map((h) => h.anchor.rects.length)).toEqual([2]);
    await page.keyboard.press('j'); // a plain move collapses the range to one line
    await expect(page.locator('.page[data-page-number="1"] .mg-selected')).toHaveCount(1);
  });

  test('a rectangle dragged on a scanned page becomes a region highlight with an empty quote (FR-LIN-08)', async ({
    page,
  }) => {
    await openDoc(page, '08-scanned-no-text.pdf');
    const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 8 });
    await expect(page.locator('.page[data-page-number="1"] .mg-selected')).toHaveCount(1); // live rectangle
    await page.mouse.up();
    await expect(toolbar(page)).toBeVisible();
    await expect(toolbar(page).getByRole('button', { name: 'Copy' })).toHaveCount(0); // nothing to copy
    await toolbar(page).getByRole('button', { name: 'Highlight: Look up' }).click();
    await expect(page.locator('.page[data-page-number="1"] .mg-hl')).toHaveCount(1);
    const [h] = await live(page, 'highlight');
    expect(h).toMatchObject({ colorId: 3, anchor: { quote: { exact: '' } } });
  });

  test('per-colour counts and document visibility in the panel, kept on this device (FR-HLT-06)', async ({ page }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('1');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Annotations' }).click();
    const chips = page.getByRole('group', { name: 'Filter by colour' });
    await expect(chips.getByRole('button', { name: /^Key idea/ })).toContainText('1');
    const eye = chips.getByRole('button', { name: 'Show Key idea highlights in the document' });
    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.mg-hl')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.mg-hl')).toHaveCount(0); // device-local preference survives reload
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page
      .getByRole('group', { name: 'Filter by colour' })
      .getByRole('button', { name: 'Show Key idea highlights in the document' })
      .click();
    await expect(page.locator('.page[data-page-number="1"] .mg-hl')).toHaveCount(1);
  });

  test('notes render Markdown safely in the panel and take the line colour as an accent (FR-NOT-05/06)', async ({
    page,
  }) => {
    await openDoc(page, '01-single-column-prose.pdf');
    const [r] = await textRows(page, 1, 8);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('2'); // Definition (green)
    await page.keyboard.press('n');
    const editor = page.getByRole('dialog', { name: 'Note' });
    await expect(editor.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await expect(editor.locator('blockquote')).toHaveCSS('border-left-color', 'rgb(143, 214, 148)');
    await page.keyboard.type('**bold** and [docs](https://example.com) <b>raw</b> [bad](javascript:alert(1))');
    await page.keyboard.press(`${PRIMARY}+Enter`);
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page.getByRole('tab', { name: 'Notes' }).click();
    const note = page.getByRole('tabpanel', { name: 'Notes' }).getByRole('listitem');
    await expect(note.locator('strong')).toHaveText('bold');
    await expect(note.getByRole('link', { name: 'docs' })).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(note.getByRole('link')).toHaveCount(1); // the javascript: link stays text
    await expect(note.locator('b')).toHaveCount(0); // raw HTML is text
    await expect(note).toContainText('<b>raw</b>');
  });
});
