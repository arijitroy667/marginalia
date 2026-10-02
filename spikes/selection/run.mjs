// S4 driver: tap-vs-drag classification trials (mouse; touch in Chromium), native selection,
// 3-line selection -> 3 canonical rects with round-trip error, across rotations. Usage: node spikes/selection/run.mjs
import { chromium, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'serve.mjs'), '5199'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const URL = 'http://localhost:5199/spikes/selection/index.html';
const FILE = '/fixtures/pdfs/01-single-column-prose.pdf';
let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const results = [];

for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  // ---- mouse
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', (e) => console.error(name, e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.ready);
  await page.evaluate((f) => api.load(f), FILE);
  let ok = 0;
  for (let i = 0; i < 50; i++) {
    const s = await page.evaluate((k) => api.span(k), 8 + (i % 20));
    await page.evaluate(() => api.clear());
    const tap = i % 2 === 0;
    const d = tap ? rand() * 3 : 6 + rand() * 60; // tap jitter < 4 px; drag >= 6 px
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x + d, s.y, { steps: 4 });
    await page.mouse.up();
    const log = await page.evaluate(() => window.log);
    if (log.at(-1)?.kind === (tap ? 'tap' : 'native')) ok++;
    else console.log(`  ${name} mouse miss: expected ${tap ? 'tap' : 'native'} d=${d.toFixed(1)}`, JSON.stringify(log));
  }
  // native selection: drag from line A start to line C middle -> 3 rects
  const sel = [];
  for (const rot of [0, 90, 180, 270]) {
    await page.evaluate((r) => api.rotate(r), rot);
    await page.evaluate(() => api.clear());
    const rows = await page.evaluate(() => api.lineStarts());
    const a = rows[6].start, c = rows[8].mid;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 12 });
    await page.mouse.up();
    const s = await page.evaluate(() => api.selection());
    const kind = (await page.evaluate(() => window.log)).at(-1)?.kind;
    sel.push({ rot, lines: s?.lines.length ?? 0, err: s ? +s.roundTripErrPx.toFixed(4) : null, kind, chars: s?.text.length ?? 0 });
  }
  results.push({ browser: name, pointer: 'mouse', trials: 50, correct: ok, selection: sel });
  console.log(name, 'mouse', `${ok}/50 correct`, JSON.stringify(sel));
  await page.close();

  // ---- touch (Chromium: CDP touch events -> pointer events)
  if (name === 'chromium') {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const tp = await ctx.newPage();
    await tp.goto(URL);
    await tp.waitForFunction(() => window.ready);
    await tp.evaluate((f) => api.load(f), FILE);
    const cdp = await ctx.newCDPSession(tp);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    let tok = 0;
    for (let i = 0; i < 50; i++) {
      const s = await tp.evaluate((k) => api.span(k), 8 + (i % 10));
      await tp.evaluate(() => api.clear());
      const tap = i % 2 === 0;
      const d = tap ? rand() * 8 : 14 + rand() * 40; // tap jitter < 10 px; swipe >= 14 px
      await touch('touchStart', s.x, s.y);
      await touch('touchMove', s.x + d / 2, s.y);
      await touch('touchMove', s.x + d, s.y);
      await touch('touchEnd', s.x + d, s.y);
      await tp.waitForTimeout(400);
      const log = await tp.evaluate(() => window.log);
      // a swipe may be taken over by the browser (pointercancel => no tap): counts as correct 'native'
      const raw = log.at(-1)?.kind ?? 'native';
      const got = raw === 'cancel' ? 'native' : raw; // browser took the gesture (scroll) => not a tap
      if (!tap) await tp.waitForTimeout(1200); // let the fling settle; a touch during momentum only stops it
      if (got === (tap ? 'tap' : 'native')) tok++;
      else console.log(`  touch miss: expected ${tap ? 'tap' : 'native'} d=${d.toFixed(1)}`, JSON.stringify(log));
    }
    results.push({ browser: name, pointer: 'touch', trials: 50, correct: tok });
    console.log(name, 'touch', `${tok}/50 correct`);
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(results));
server.kill();
