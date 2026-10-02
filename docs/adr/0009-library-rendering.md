# ADR 0009 — Library: native rendering instead of a JS virtualiser (T-106)

- Status: accepted (2026-10-02)
- Requirements: FR-LIB-04 ("500 documents render without jank (virtualised list)"), NFR-PERF-02

## Decision

No virtualisation library. Every card renders, with CSS `content-visibility: auto` +
`contain-intrinsic-size` so the browser skips layout and paint for off-screen cards, and covers load
lazily (IntersectionObserver with a 400 px margin, then a Dexie read, then an object URL revoked on unmount).
One code path serves both grid (auto-fill CSS grid) and list layouts. Older Safari (< 18) lacks
`content-visibility` and simply lays out all cards, which is still fine at this size.

## Evidence (`e2e/library.spec.ts`, 500 seeded documents, Chromium)

| Project | Time to all 500 items | Scroll (rAF, 120 px/frame) |
|---|---|---|
| Desktop Chrome | 0.53–0.60 s | p95 frame 16.7 ms, max 16.8 ms |
| Pixel 7 emulation | 0.40–0.62 s | p95 frame 16.7 ms, max 16.8 ms |

The test asserts < 3 s and p95 < 25 ms. If a real phone at M1 exit shows jank, swap in
`@tanstack/react-virtual` behind `DocumentCard` (the card API stays the same).
