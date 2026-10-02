// S3 driver: overlay drift (math + pixels) across zoom x rotation x page geometry, canvas caps, pinch fps.
// Usage: node spikes/overlay/run.mjs
import { chromium, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'serve.mjs'), '5199'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const URL = 'http://localhost:5199/spikes/overlay/index.html';
const out = { drift: {}, canvases: {}, pinch: {}, signed: {} };

for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: dpr });
    page.on('pageerror', (e) => console.error(name, 'pageerror', e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => api.load('/fixtures/pdfs/15-geometry-calibration.pdf', '/fixtures/pdfs/truth/15-geometry-calibration.boxes.json'));
    let mathMax = 0, pixMax = 0, n = 0, maxCanvas = 0;
    for (const p of [1, 2, 3, 4]) {
      for (const scale of [0.5, 1, 2, 4]) {
        for (const rot of [0, 90, 180, 270]) {
          await page.evaluate(({ p, scale, rot }) => api.view(p, scale, rot), { p, scale, rot });
          const md = await page.evaluate((p) => api.mathDrift(p), p);
          mathMax = Math.max(mathMax, ...md);
          // pixel check on box 0 (fits the 1600px viewport at 400 % in every rotation)
          const o = await page.evaluate((p) => api.overlayRect(p, 0), p);
          const pad = 6;
          const clip = { x: Math.max(0, o.x - pad), y: Math.max(0, o.y - pad), width: o.w + 2 * pad, height: o.h + 2 * pad };
          const png = await page.screenshot({ clip });
          const dbox = await page.evaluate((b) => api.darkBox(b), png.toString('base64'));
          // screenshot pixels are device px; convert to CSS px
          const sd = [dbox.x0 / dpr + clip.x - o.x, dbox.y0 / dpr + clip.y - o.y, dbox.x1 / dpr + clip.x - (o.x + o.w), dbox.y1 / dpr + clip.y - (o.y + o.h)];
          const d = sd.map(Math.abs);
          pixMax = Math.max(pixMax, ...d);
          (out.signed[`${name}-dpr${dpr}`] ??= []).push(sd);
          if (Math.max(...d) > 1) console.log(`  ${name} dpr${dpr} p${p} x${scale} r${rot}: signed pixel drift L,T,R,B ${sd.map((v) => v.toFixed(2))}`);
          maxCanvas = Math.max(maxCanvas, ...(await page.evaluate(() => api.canvases())));
          n++;
        }
      }
    }
    out.drift[`${name}-dpr${dpr}`] = { combos: n, mathMaxPx: +mathMax.toFixed(3), pixelMaxPx: +pixMax.toFixed(3) };
    out.canvases[`${name}-dpr${dpr}`] = maxCanvas;
    console.log(name, `dpr${dpr}`, `combos ${n}`, `math drift max ${mathMax.toFixed(3)} px`, `pixel drift max ${pixMax.toFixed(3)} px`, `largest canvas ${maxCanvas} px`);
    await page.close();
  }

  // pinch fps on the 500-page fixture (touch-enabled mobile-ish context)
  if (name === 'chromium' && existsSync('fixtures/pdfs/12-large-500p.pdf')) { // WebKit: no Touch constructor
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name === 'chromium' });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => api.load('/fixtures/pdfs/12-large-500p.pdf', null));
    await page.evaluate(() => api.view(120, 0.6, 0));
    for (const throttle of name === 'chromium' ? [1, 4] : [1]) {
      if (name === 'chromium') {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      for (const mode of ['css', 'updateScale']) {
        await page.evaluate(() => api.view(120, 0.6, 0));
        const r = await page.evaluate((mode) => api.pinchTest(mode, 2.0), mode);
        out.pinch[`${name}-cpu${throttle}x-${mode}`] = r;
        console.log(name, `cpu${throttle}x`, mode.padEnd(12), `fps ${r.fps}`, `p95 frame ${r.p95} ms`, `frames ${r.frames}`, `final scale ${r.scale}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
}
writeFileSync(join(import.meta.dirname, 'results.json'), JSON.stringify(out, null, 1));
server.kill();
