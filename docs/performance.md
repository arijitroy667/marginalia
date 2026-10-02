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

