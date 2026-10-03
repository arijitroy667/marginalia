# Performance measurements

Re-run: `python fixtures/generate.py --large` once, then `PERF=1 pnpm exec playwright test e2e/perf.spec.ts --workers 1`
(`PERF=1` also tightens the library 500-document scroll gate in `e2e/library.spec.ts` from p95 < 50 ms to < 25 ms.)
(production build, Chromium; numbers below from a desktop dev machine, 2026-10-02). Real-device runs are part
of `docs/qa-checklist.md`.

## M1 exit — NFR-PERF-01 / NFR-PERF-02 (520-page, 33 MB fixture, cached in IndexedDB)

| Scenario | First page visible (click → canvas) | Scroll (rAF, scrollTop += 60 px/frame for 3 s) |
|---|---|---|
| Desktop Chrome, 1x CPU | **1.34 s** (budget < 1.5 s ✅) | **60 fps**, p95 frame 16.7 ms (budget 60 fps ✅) |
| Pixel 7 emulation, 1x CPU | 0.96 s | 60 fps, p95 16.7 ms |
| Pixel 7 emulation, **4x CPU throttle** (mid-range proxy) | **1.68 s** (budget < 3 s ✅) | **27 fps**, p95 66.7 ms (budget ≥ 45 fps ⚠️) |
| Desktop Chrome, 4x CPU | 5.6 s | 37 fps |

Notes:

- The scroll test writes `scrollTop` from the main thread at ~3,600 px/s through pages with full-page JPEG
  images, so it measures the worst case. Real touch scrolling is composited off the main thread and keeps
  moving while PDF.js renders; the phone budget must be confirmed on a real device (QA checklist). If it
  fails there: lower `maxCanvasPixels` on coarse pointers further, disable the high-zoom detail canvas on
  phones, and defer thumbnail rendering while scrolling.
- Other measured budgets: library with 500 documents (ADR 0009) 0.4–0.6 s, scroll p95 16.7 ms;
  Line Engine 0.27 ms per 3,000 chars (ADR 0001); theme switch 5–86 ms (ADR 0002); pinch 60 fps at 4x
  CPU (ADR 0003).
- App-shell JS: 195 KB gzip initial (budget ≤ 250 KB, NFR-PERF-08); PDF.js and the reader load lazily.

## M2 exit — NFR-PERF-03 / NFR-PERF-05 (2026-10-03)

`PERF=1 pnpm exec playwright test e2e/perf.spec.ts --project chromium -g NFR-PERF-03 --workers 1`: key press →
annotation element in the DOM and painted (next frame), 5 lines each, `01-single-column-prose.pdf`.

| Input → visible | Desktop Chrome 1x CPU | 4x CPU throttle (mid-range phone proxy) | Budget |
|---|---|---|---|
| `H` → highlight wash | median **14 ms** (max 42) | median **47 ms** (max 107, first, cold) | < 100 ms ✅ |
| `B` → bookmark ribbon (+ toast) | median **14 ms** (max 37) | median **83 ms** (max 86) | < 100 ms ✅ |

- The write is optimistic: one Dexie transaction (row + outbox) then a live-query re-render; no network on the path.
- Theme switch (NFR-PERF-05): 12–31 ms to the next frame, no re-render (`e2e/theme.spec.ts`, ADR 0002).
- Real-device confirmation is part of the M2 section of `docs/qa-checklist.md`.

## M4 performance pass (T-403, 2026-10-03)

**Lighthouse** (`lighthouserc.json`, CI step; production build, local-only): mobile profile, 3 runs — Performance
**95**, Accessibility **100**, Best practices **100**, SEO **100**; FCP 2.2 s, LCP 2.4–2.5 s, TBT 0–10 ms, CLS 0.
Desktop profile: 100 / 100 / 100 / 100 (FCP 0.5 s, LCP 0.6 s). CI fails below 90 / 100 / 95 / 90, LCP > 3 s,
TBT > 200 ms or CLS > 0.1.

**Budgets** (`PERF=1 … e2e/perf.spec.ts`, 520-page fixture). This machine's background load varies a lot, so the
M1 commit was rebuilt in a worktree and measured **interleaved** with the current build:

| | M1 build | Current build | Budget |
|---|---|---|---|
| Desktop first page, 1x | 1.47 s | 1.37–1.41 s | < 1.5 s ✅ |
| Desktop scroll, 1x | 59 fps | 59–60 fps | 60 fps ✅ |
| Pixel 7 first page, 1x | 0.96–1.03 s (one 0.52 s outlier) | 0.95–1.00 s | — |
| Pixel 7 first page, 4x CPU | 1.77–2.00 s | 1.85 s after the fixes below (1.97–2.51 s before) | < 3 s ✅ |
| Pixel 7 scroll, 4x CPU | 22.3–23.9 fps | 21.2 fps after the fixes (19.5–20.9 before) | ≥ 45 fps ⚠️ (both builds; real device) |
| Input → visible annotation | — | highlight 13 ms / bookmark 28 ms (1x); 62 / 93 ms (4x) | < 100 ms ✅ |
| Theme switch | — | 12–31 ms | < 300 ms ✅ |
| App shell JS | 195 KB gzip | 206 KB gzip | ≤ 250 KB ✅ |

- A CPU profile of the 4x scroll shows ~250 ms of script in 3 s; the rest is the browser rasterising the
  page canvases (`(program)`), so emulated 4x scrolling is bound by rendering, as at M1. The phone scroll budget is
  decided on a real device (QA checklist).
- Fixed in this pass: every newly rendered page re-rendered the overlay layers of all pages seen so far (O(n) per
  page on long books) — page layers are memoised; each page's lines (used for the first tap and the "no selectable
  text" banner) were extracted the moment its text layer rendered, competing with rendering mid-scroll — they are
  now prepared in idle time (`requestIdleCallback`, timeout fallback), which keeps the first tap instant; the
  already-dark-page sampling (a GPU readback) runs only in the Dark theme. After these: Pixel 7 4x first page
  1.85 s, scroll 21.2 fps (M1 build: 1.77–2.00 s, 22.3–23.9 fps). Disabling the overlay hosts entirely changed 4x
  scroll by less than run-to-run noise.
- An attempt to detect text-less pages from the rendered text layer instead was reverted: it dropped the warm-up,
  so the first tap on a page waited for text extraction (caught by the panel and search E2E tests).

