// S2 driver: screenshots + timings + contrast/image-fidelity for theme strategies.
// Usage: node spikes/theme/run.mjs   (starts spikes/serve.mjs itself)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'serve.mjs'), '5199'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const SET = [
  ['text-only', '/fixtures/pdfs/01-single-column-prose.pdf', 2],
  ['image-heavy', '/fixtures/pdfs/04-slides-16x9.pdf', 3],
  ['coloured-slides', '/fixtures/pdfs/04-slides-16x9.pdf', 4],
  ['dark-slide', '/fixtures/pdfs/04-slides-16x9.pdf', 1],
  ['scanned', '/fixtures/pdfs/08-scanned-no-text.pdf', 1],
  ['mixed-ocr', '/fixtures/pdfs/09-scanned-hidden-ocr.pdf', 1],
  ['mixed-sidebar', '/fixtures/pdfs/03-textbook-sidebar-footnotes.pdf', 1],
  ...(existsSync('fixtures/pdfs/real/acl-bert-N19-1423.pdf') ? [['diagram-heavy', '/fixtures/pdfs/real/acl-bert-N19-1423.pdf', 3]] : []),
];
const MODES = [
  ['light', (p) => p.evaluate(() => api.css('light', false))],
  ['css-warm', (p) => p.evaluate(() => api.css('warm', true))],
  ['css-dark', (p) => p.evaluate(() => api.css('dark', true))],
  ['css-dark-invert-images', (p) => p.evaluate(() => api.css('dark', false))],
  ['pageColors-warm', (p, n) => p.evaluate((n) => api.pageColors('warm', n), n)],
  ['pageColors-dark', (p, n) => p.evaluate((n) => api.pageColors('dark', n), n)],
];

// In-page pixel statistics on a PNG screenshot (WCAG relative luminance / contrast).
async function stats(page, png, region) {
  return page.evaluate(async ({ b64, region }) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const counts = new Map();
    const lums = [];
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
      lums.push(L(data[i], data[i + 1], data[i + 2]));
    }
    const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bg = [bgKey >> 16, (bgKey >> 8) & 255, bgKey & 255];
    const bgL = L(...bg);
    lums.sort((a, b) => a - b);
    const textL = bgL > 0.5 ? lums[Math.floor(lums.length * 0.003)] : lums[Math.floor(lums.length * 0.997)];
    const contrast = (Math.max(bgL, textL) + 0.05) / (Math.min(bgL, textL) + 0.05);
    let regionPixels = null;
    if (region) {
      const { x, y, w, h } = region;
      regionPixels = Array.from(ctx.getImageData(Math.round(x * bmp.width), Math.round(y * bmp.height), Math.max(1, Math.round(w * bmp.width)), Math.max(1, Math.round(h * bmp.height))).data);
    }
    return { bg: '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join(''), contrast: +contrast.toFixed(2), regionPixels };
  }, { b64: png.toString('base64'), region });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 2300 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:5199/spikes/theme/index.html');
await page.waitForFunction(() => window.ready);

const results = [];
for (const [label, file, n] of SET) {
  await page.evaluate(({ file }) => api.load(file, 1), { file });
  const w = (await page.evaluate((n) => api.pageBox(n), n)).width;
  await page.evaluate(({ file, s }) => api.load(file, s), { file, s: 1500 / w });
  await page.evaluate((n) => api.goto(n), n);
  let lightRegion = null;
  for (const [mode, apply] of MODES) {
    const ms = await apply(page, n);
    const box = await page.evaluate((n) => api.pageBox(n), n);
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    writeFileSync(join(OUT, `${label}-${mode}.png`), png);
    const s = await stats(page, png, label === 'image-heavy' ? { x: 500 / 960, y: 80 / 540, w: 420 / 960, h: 280 / 540 } : null);
    let imageDiff = null;
    if (s.regionPixels) {
      if (mode === 'light') lightRegion = s.regionPixels;
      else if (lightRegion) {
        let d = 0;
        for (let i = 0; i < lightRegion.length; i += 4) d += Math.abs(lightRegion[i] - s.regionPixels[i]) + Math.abs(lightRegion[i + 1] - s.regionPixels[i + 1]) + Math.abs(lightRegion[i + 2] - s.regionPixels[i + 2]);
        imageDiff = +(d / (lightRegion.length / 4) / 3).toFixed(1); // mean abs diff per channel, 0..255
      }
    }
    results.push({ label, mode, ms: +ms.toFixed(1), canvas: box.canvas, bg: s.bg, contrast: s.contrast, imageDiff });
    console.log(label.padEnd(16), mode.padEnd(24), `${ms.toFixed(1)} ms`.padStart(10), `canvas ${box.canvas}`, `bg ${s.bg}`, `contrast ${s.contrast}`, imageDiff === null ? '' : `imageDiff ${imageDiff}`);
  }
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
await browser.close();
server.kill();
