import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addViaPicker, idb, noIdbBlobs, openDoc, textRows } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** axe violations as readable lines (rule: target), so a failure says what to fix. */
async function audit(page: Page, label: string, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const sel of exclude) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  return violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${label} · ${v.id} (${v.impact}): ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`,
    ),
  );
}

// the PDF's own text layer is transparent text over the canvas: colour contrast does not apply to it
const PDF = ['.textLayer', '.annotationLayer'];

test.describe('accessibility audit (T-402, NFR-A11Y-01/02)', () => {
  for (const theme of ['light', 'dark'] as const)
    test(`no WCAG A/AA violations on the main screens (${theme})`, async ({ page, browserName, isMobile }) => {
      test.skip(noIdbBlobs(browserName), "Playwright's WebKit: no IndexedDB Blobs");
      await page.emulateMedia({ colorScheme: theme });
      const found: string[] = [];
      await page.goto('/');
      found.push(...(await audit(page, 'empty library')));
      await openDoc(page, '01-single-column-prose.pdf');
      found.push(...(await audit(page, 'reader', PDF)));
      const [r] = await textRows(page, 1, 8);
      if (isMobile) await page.touchscreen.tap(r.x, r.y);
      else await page.mouse.click(r.x, r.y);
      await expect(page.getByRole('toolbar', { name: 'Line actions' })).toBeVisible();
      found.push(...(await audit(page, 'line toolbar', PDF)));
      await page.getByRole('toolbar', { name: 'Line actions' }).getByRole('button', { name: 'Note' }).click();
      await expect(page.getByRole('dialog', { name: 'Note' })).toBeVisible();
      found.push(...(await audit(page, 'note editor', PDF)));
      await page.keyboard.press('Escape');
      if (!isMobile) {
        await page.keyboard.press('Shift+?');
        found.push(...(await audit(page, 'cheat sheet', PDF)));
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Theme' }).first().click();
        found.push(...(await audit(page, 'theme popover', PDF)));
        await page.keyboard.press('Escape');
        await page.getByRole('tab', { name: 'Annotations' }).click();
        found.push(...(await audit(page, 'annotation panel', PDF)));
      }
      await page.goto('/');
      found.push(...(await audit(page, 'library')));
      await page.goto('/settings');
      found.push(...(await audit(page, 'settings')));
      await page.goto('/sync-issues');
      found.push(...(await audit(page, 'sync issues')));
      expect(found, found.join('\n')).toEqual([]);
    });

  test('touch targets are at least 44 x 44 px on phones (NFR-A11Y-02)', async ({ page, browserName, isMobile }) => {
    test.skip(!isMobile || noIdbBlobs(browserName), 'phones');
    const small: string[] = [];
    const check = async (label: string) =>
      small.push(
        ...(await page.evaluate((label) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, [role="tab"], [role="menuitem"]',
          )) {
            if (el.closest('.textLayer, .annotationLayer')) continue; // PDF content
            if (el.classList.contains('sr-only') && document.activeElement !== el) continue; // visually hidden until focused
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
            const type = (el as HTMLInputElement).type;
            if (type === 'checkbox' || type === 'radio') continue; // the whole label row is the target (min-h-11)
            if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
              // an invisible ::before hit area (gutter markers) counts
              const before = getComputedStyle(el, '::before');
              const extra = before.content !== 'none' && before.position === 'absolute';
              if (!extra)
                out.push(
                  `${label}: ${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
                );
            }
          }
          return out;
        }, label)),
      );
    await page.goto('/');
    await check('empty library');
    await openDoc(page, '01-single-column-prose.pdf');
    await check('reader');
    const [r] = await textRows(page, 1, 8);
    await page.touchscreen.tap(r.x, r.y);
    await page.getByRole('button', { name: 'Highlight: Key idea' }).click();
    await page.getByRole('toolbar', { name: 'Line actions' }).getByRole('button', { name: 'Bookmark' }).click();
    await check('reader with toolbar and markers');
    await page.goto('/');
    await check('library');
    await page.goto('/settings');
    await check('settings');
    expect(small, small.join('\n')).toEqual([]);
  });

  test('keyboard only: open a book, select the reading line, highlight, note, bookmark; focus is visible', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(isMobile || noIdbBlobs(browserName), 'keyboard');
    await page.goto('/');
    await addViaPicker(page, '01-single-column-prose.pdf');
    await expect(page.getByRole('link', { name: /01-single-column-prose/ })).toBeVisible();
    let guard = 0;
    while (
      !(await page
        .getByRole('link', { name: /01-single-column-prose/ })
        .evaluate((el) => el === document.activeElement)) &&
      guard++ < 30
    )
      await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(ring).not.toBe('none'); // :focus-visible
    await page.keyboard.press('Enter');
    await expect(page.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()).toBeVisible();

    await page.keyboard.press('j'); // no cursor yet: selects the reading line
    await expect(page.getByRole('toolbar', { name: 'Line actions' })).toBeVisible();
    await page.keyboard.press('j');
    await page.keyboard.press('h');
    await expect(page.locator('.mg-hl')).toHaveCount(1);
    await page.keyboard.press('n');
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('typed without a mouse');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Note' })).toHaveCount(0);
    await page.keyboard.press('b');
    await expect(page.locator('.mg-ribbon')).toHaveCount(1);
    await expect
      .poll(async () => (await idb<{ kind: string }>(page, 'annotations')).map((a) => a.kind).sort())
      .toEqual(['bookmark', 'highlight', 'note']);
  });
});
