import { expect, test, type Page } from '@playwright/test';
import { idb, noIdbBlobs, openDoc, textRows } from './helpers';

interface Row {
  id: string;
  kind: string;
  body: string | null;
  deletedAt: string | null;
}
const notes = async (page: Page) =>
  (await idb<Row>(page, 'annotations')).filter((a) => a.kind === 'note' && a.deletedAt === null);
const editor = (page: Page) => page.getByRole('dialog', { name: 'Note' });
const textarea = (page: Page) => editor(page).getByRole('textbox', { name: 'Note' });
const marker = (page: Page) => page.locator('.page[data-page-number="1"] .mg-note-btn');
const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

async function selectRow(page: Page, k: number, isMobile: boolean) {
  const [r] = await textRows(page, 1, k);
  if (isMobile) await page.touchscreen.tap(r.x, r.y);
  else await page.mouse.click(r.x, r.y);
  await expect(page.getByRole('toolbar', { name: 'Line actions' })).toBeVisible();
}

test.describe('notes (T-207, FR-NOT-01..03)', () => {
  test.beforeEach(({ browserName }) => test.skip(noIdbBlobs(browserName), 'WinCairo WebKit: no IndexedDB Blobs'));

  test('N opens an editor on the line; autosave; Esc closes saved; the gutter marker reopens it; hover previews', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard + hover');
    await openDoc(page, '01-single-column-prose.pdf');
    await selectRow(page, 8, false);
    await page.keyboard.press('n');
    await expect(textarea(page)).toBeFocused(); // auto-focus, and the N did not land in it
    await expect(textarea(page)).toHaveValue('');
    await expect(editor(page).locator('blockquote')).not.toBeEmpty(); // quoted line
    await page.keyboard.type('Why slowly?');
    await expect.poll(async () => (await notes(page)).map((n) => n.body), { timeout: 2000 }).toEqual(['Why slowly?']); // 500 ms autosave
    await page.keyboard.type(' Check chapter 2.');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect.poll(async () => (await notes(page)).map((n) => n.body)).toEqual(['Why slowly? Check chapter 2.']);

    await expect(marker(page)).toHaveAttribute('aria-label', 'Note: Why slowly? Check chapter 2.');
    await marker(page).hover();
    await expect(page.locator('.mg-preview')).toBeVisible();
    await marker(page).click();
    await expect(textarea(page)).toHaveValue('Why slowly? Check chapter 2.');
    await textarea(page).press('End');
    await page.keyboard.type('!');
    await page.keyboard.press(`${PRIMARY}+Enter`); // saves and closes
    await expect(editor(page)).toHaveCount(0);
    await expect.poll(async () => (await notes(page)).map((n) => n.body)).toEqual(['Why slowly? Check chapter 2.!']);
  });

  test('an empty new note is discarded silently', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await selectRow(page, 8, false);
    await page.keyboard.press('n');
    await expect(textarea(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await notes(page)).toEqual([]);
    await expect(marker(page)).toHaveCount(0);
  });

  test('clearing an existing note asks first; Delete is undoable; a session is one undo step', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await selectRow(page, 8, false);
    await page.keyboard.press('n');
    await expect(textarea(page)).toBeFocused();
    await page.keyboard.type('keep me');
    await page.keyboard.press(`${PRIMARY}+Enter`);
    await expect(marker(page)).toHaveCount(1);

    await marker(page).click();
    await textarea(page).fill('');
    await expect(editor(page).getByText('Delete this note?')).toBeVisible();
    await editor(page).getByRole('button', { name: 'Keep' }).click();
    await expect(textarea(page)).toHaveValue('keep me');
    await editor(page).getByRole('button', { name: 'Delete note' }).click(); // asks again
    await editor(page).getByRole('button', { name: 'Delete note' }).click();
    await expect(marker(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(marker(page)).toHaveCount(1);

    await page.locator('.reader-scroll').focus();
    await page.keyboard.press(`${PRIMARY}+z`); // undoes the note's creation session
    await expect(marker(page)).toHaveCount(0);
  });

  test('a note on a highlighted line: the indicator takes the colour, the wash gets a left rule; dot style', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard');
    await openDoc(page, '01-single-column-prose.pdf');
    await selectRow(page, 8, false);
    await page.keyboard.press('2'); // Definition (green)
    await page.keyboard.press('n');
    await expect(textarea(page)).toBeFocused();
    await page.keyboard.type('green note');
    await page.keyboard.press(`${PRIMARY}+Enter`);
    await expect(marker(page)).toHaveAttribute('style', /--note-fill: var\(--hl-2/);
    await expect(page.locator('.page[data-page-number="1"] .mg-hl-rule')).toHaveCount(1);

    // gutter style setting (FR-NOT-02): dot instead of bubble
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('marginalia');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            const store = tx.objectStore('meta');
            const get = store.get('settings');
            get.onsuccess = () => {
              const v = (get.result as { value?: { settings: Record<string, unknown> } } | undefined)?.value ?? {
                settings: {},
                updatedAt: new Date().toISOString(),
                localUpdatedAt: 0,
              };
              store.put({ key: 'settings', value: { ...v, settings: { ...v.settings, gutterStyle: 'dot' } } });
            };
            tx.oncomplete = () => (open.result.close(), resolve());
          };
        }),
    );
    await page.reload();
    await expect(page.locator('.page[data-page-number="1"] .mg-note-btn .mg-dot')).toBeAttached();
  });

  test('phones: toolbar Note, type, tap elsewhere to close and save', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await openDoc(page, '01-single-column-prose.pdf');
    await selectRow(page, 8, true);
    await page.getByRole('toolbar', { name: 'Line actions' }).getByRole('button', { name: 'Note' }).click();
    await expect(textarea(page)).toBeFocused();
    await page.keyboard.type('on the go');
    const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.touchscreen.tap(box.x + 6, box.y + box.height - 20); // outside the popover
    await expect(editor(page)).toHaveCount(0);
    await expect.poll(async () => (await notes(page)).map((n) => n.body)).toEqual(['on the go']);
    await expect(marker(page)).toHaveCount(1);
  });
});
