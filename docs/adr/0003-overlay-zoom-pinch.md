# ADR 0003 — Overlay geometry, canvas caps and pinch zoom (spike S3)

- Status: accepted for emulated browsers (2026-10-02); **real-device check pending** (Android Chrome, iOS Safari)
- Requirements: PRD §8.4, §8.6, §11 S3, FR-RDR-01/03, NFR-PERF-04, R2

## Decisions

1. **Overlay geometry.** Annotation rects stay normalised in canonical space (intrinsic `/Rotate` applied,
   user rotation 0). `fromCanonical(rect, userRotation)` maps them to the displayed page box (CW rotation):
   90 → `(1−y−h, x, h, w)`, 180 → `(1−x−w, 1−y−h, w, h)`, 270 → `(y, 1−x−w, h, w)`;
   `toCanonical(r, rot) = fromCanonical(r, 360 − rot)`. Overlays are absolutely positioned children of the
   PDF.js page `div` (`inset: 0`, same box as `.canvasWrapper`), placed in **%**, so zoom needs no
   recomputation; rotation re-maps on the `rotationchanging` event.
2. **Pinch = CSS `transform: scale()` on `.pdfViewer` during the gesture** (origin at the pinch midpoint,
   `will-change: transform`), committed on release with the public
   `PDFViewer.updateScale({ scaleFactor, origin })`, which keeps the origin fixed and re-renders.
   Calling `updateScale` on every move (what PDF.js's own app does) relayouts all page views per frame.
3. **Canvas caps.** `PDFViewer({ maxCanvasPixels: 16_777_216 })` on desktop; T-112 lowers it on
   mobile (8,388,608 initial) and tunes on devices. PDF.js frees canvases with `width = height = 0`
   (Safari-safe) and keeps rendered page views in an LRU of `max(10, 2·visible + 1)`. That LRU replaces the
   PRD's literal "visible ±1" (FR-RDR-01/NFR-PERF-04): memory stays bounded by `cap × cache size`, and
   re-implementing PDF.js's buffer would mean patching internals (rule 9). The < 300 MB phone budget is
   measured at M1 exit on a real device.
4. Use `viewport.convertToViewportPoint` (PDF.js 6 removed `convertToViewportRectangle`).

## Evidence (`node spikes/overlay/run.mjs`; fixture `15-geometry-calibration.pdf`: portrait, landscape,
`/Rotate 90`, A4 `/Rotate 270`; zoom 50/100/200/400 %; user rotation 0/90/180/270; DPR 1 and 2)

| | Overlay vs PDF.js viewport math | Overlay vs rendered pixels (sub-pixel ink edges): mean signed / p95 / max | Combos > 1 px |
|---|---|---|---|
| Chromium DPR 1 | ≤ 0.029 px | +0.1–0.3 / 0.91 / 1.24 px | 4 / 64 |
| Chromium DPR 2 | ≤ 0.028 px | ±0.1–0.2 / 0.60 / 3.03 px | 2 / 64 |
| WebKit DPR 1 | ≤ 0.029 px | +0.4–0.8 / 1.89 / 3.54 px | 22 / 64 |
| WebKit DPR 2 | ≤ 0.028 px | +0.3–0.8 / 1.54 / 3.14 px | 21 / 64 |

- The overlay math is exact. The residual is between PDF.js's coordinate system and where the browser
  paints the canvas: sub-pixel snapping (WebKit shifts ~+0.6 px right/down), canvas upscaling blur at 400 %
  (ink spreads outward on both sides), and PDF.js's high-zoom *detail canvas*. PDF.js's own text layer
  has the same residual. At 400 % a 3 px offset is ~5 % of a line height; at 100 % it stays ≤ ~1 px.
- Largest canvas seen: 14.2 MP (DPR 2, 400 %), under the 16.7 MP cap ✅.
- Pinch on the 500-page fixture (`12-large-500p.pdf`, 412×915 @ DPR 2, synthetic two-finger gesture,
  2× zoom over 1.2 s): CSS transform **60 fps at 1× and 4× CPU throttle** ✅; per-move `updateScale`
  60 fps at 1×, **46–48 fps (p95 frame 33 ms) at 4×**.

In-app re-check (T-202, `e2e/overlay.spec.ts`): highlight rect vs the black calibration box's rendered
pixels ≤ 2 px on desktop Chromium at rotations 0–270 and 200 %. In Pixel 7 emulation (DPR **2.625**) the canvas
ink sits 2.3–3.2 px right of PDF.js's CSS layout (left +2.3, right +3.2, top/bottom +0.4): PDF.js floors the
canvas buffer to a divisor of the fractional output scale. The overlay matches PDF.js's coordinate system
exactly (same as the text layer), so native selection shows the same offset on such devices. Real-device QA
decides whether it is visible; if so, position the overlay against the canvas element box instead.

## Gate status

- Drift ≤ 1 CSS px: met at p95 in Chromium; WebKit desktop exceeds it at high zoom by ≤ 3.5 px.
  Playwright WebKit is not iOS Safari, so S3 stays **open for the real iPhone/Android pass** in
  `docs/qa-checklist.md` (pinch fps, drift at 400 %, scroll/pinch/tap conflicts). If iOS fails the pinch
  budget, fall back to stepped zoom (buttons + double-tap) per the §11 gate and record it here.
- Canvas cap ✅. Emulated pinch ≥ 45 fps ✅.
