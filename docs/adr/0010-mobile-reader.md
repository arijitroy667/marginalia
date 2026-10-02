# ADR 0010 — Phone reader layout: overlay chrome, reading slot, pinch (T-112)

- Status: accepted (2026-10-02); real-device pass pending (`docs/qa-checklist.md`)
- Requirements: PRD §10.3, §5 (reading line), FR-RDR-02/03, FR-KEY-05, NFR-PERF-04, ADR 0003

## Decisions

1. **Below 768 px the bars overlay the page** (absolute, slide away with `transform`) instead of taking
   layout space, so hiding them never resizes the scroller, re-fits the page or shifts text. Top: back,
   title, find. Bottom: page field, scrubber (`<input type="range">`), sidebar, theme. Desktop is unchanged.
2. **Auto-hide**: scrolling down > 12 px hides the bars; scrolling up or being within 64 px of the top shows
   them; a tap on blank space toggles them (the S4 tap classifier; links/buttons excluded). Keyboard or
   screen-reader focus entering a bar shows it, so hidden controls stay operable. Link taps and Contents
   jumps hide the bars (reading mode).
3. **Reading slot = scroller top + overlaying chrome height + 8 px** (PRD §5), read from layout at call time
   (`getInset`), so resume and the app's own page jumps land below the top bar. PDF.js places link/outline
   destinations at the scroller's top edge; hiding the bars on those jumps keeps them visible. Search hits
   are placed 50 px down by PDF.js, clear of the 48 px bar.
4. **Pinch** = CSS `transform` on `.pdfViewer` during the gesture, one `updateScale({ scaleFactor, origin })`
   on release (ADR 0003), clamped 50–400 %; `touch-action: pan-x pan-y` keeps one-finger scrolling native and
   blocks the browser's page zoom; iOS `gesturestart` is cancelled.
5. **Canvas caps**: `maxCanvasPixels` 8.4 MP on coarse pointers (16.7 MP otherwise) bounds memory at every
   zoom and DPR; PDF.js exposes no separate DPR cap, and the pixel cap is the binding limit (NFR-PERF-04).

## Evidence

`e2e/mobile.spec.ts` (Pixel 7 emulation): bar contents; hide on scroll down / show on scroll up; tap
toggles; pages start below the top bar on open and after a jump; scrubber; synthetic two-finger pinch
raises the committed scale > 1.6x. Resume E2E runs on Pixel with the overlay inset.
