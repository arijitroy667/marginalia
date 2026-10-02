# ADR 0004 — Tap vs drag, selection → anchor rects, toolbar placement (spike S4)

- Status: accepted for emulated browsers (2026-10-02); **real-device pass pending** (`docs/qa-checklist.md`)
- Requirements: PRD §8.6, §8.9, §11 S4, FR-LIN-01/02/04/07, FR-RDR-07

## Decisions

1. **Classification** (`classifyPointer`, pure, unit-tested): `tap` ⇔ travel < 4 px (mouse/pen) or < 10 px
   (touch), measured as the *max* distance from pointerdown, **and** < 300 ms, **and** `PointerEvent.detail
   < 2`. Everything else is native text selection. Listeners are passive observers on `pointerdown/move/up`:
   no `preventDefault`, so native selection, long-press and scrolling are never blocked.
   - Click jitter of 1–3 px makes browsers select 1–2 characters; a geometric tap **clears that stray
     selection** and selects the line (without this, Chromium misread 10/50 taps).
   - Double/triple click stays native (word/line selection), then shows the same toolbar (FR-LIN-04).
   - `pointercancel` = the browser took the gesture (scroll, fling, native selection) ⇒ never a tap.
     A touch that stops a momentum scroll is consumed by the browser, which matches native phone behaviour.
2. **Selection → anchor rects** (FR-LIN-04): `range.getClientRects()` → drop empty and page-wide rects →
   normalise against the page's `.canvasWrapper` box → `toCanonical(rect, userRotation)` → group into one
   rect per visual line by vertical overlap ≥ 50 % of the smaller height (the Line Engine's
   super/subscript rule). Grouping happens in canonical space, so it is rotation-independent.
3. **Toolbar placement** (H-iOS callout, §8.9): don't suppress the native callout. Line taps (no native
   selection, so no callout) and mouse selections put the toolbar **above** the line. **Touch selections** put
   it **below** the selection's last rect, because iOS and Android show their callout/action bar above. Clamp to
   the viewport and `env(safe-area-inset-*)`.

## Evidence (`node spikes/selection/run.mjs`, fixture 01)

| Trial set | Result | Gate |
|---|---|---|
| 50 mouse trials (25 taps with 0–3 px jitter, 25 drags 6–66 px), Chromium | **50/50** | ≥ 95 % ✅ |
| same, WebKit | **50/50** | ≥ 95 % ✅ |
| 50 touch trials (25 taps 0–8 px, 25 swipes 14–54 px), Chromium mobile emulation (CDP) | **50/50** | ≥ 95 % ✅ |
| 3-line mouse drag at user rotation 0/90/180/270 (Chromium, WebKit) | **3 rects** each, 102 chars, round-trip error **0 px** | 3 rects within 1 px ✅ |

Native selection worked in every drag trial (non-empty selection, classified native).

## Open (manual, real devices)

Long-press word selection, drag handles and the iOS callout/toolbar overlap can't be emulated in
Playwright. They are in the M0 section of `docs/qa-checklist.md`, together with S3's pinch checks.
