# ADR 0015 — Keymap router, cheat sheet and phone gestures (T-210)

- Status: accepted (2026-10-02)
- Requirements: FR-KEY-01/02/03/05, FR-LIN-04, Appendix A, PRD §10.3

## Decision

1. **One table, one router.** `features/reader/keymap.ts` lists every binding (`action`, keys, group, Ctrl/Cmd,
   required Shift) and `route(event)` returns the action or null. Guards live only there: no single key in text
   fields, during IME composition (`isComposing`, keyCode 229) or with Ctrl/Cmd/Alt; Ctrl/Cmd chords work
   everywhere except undo/redo inside text fields. No modifier-only chords, no browser-reserved combos (H3).
   ReaderView maps actions to handlers; a handler that does not apply (arrows without a line cursor, H without a
   selection) returns false and the browser default runs. FR-KEY-04 remapping (P1) will edit this table.
2. **Cheat sheet** (`?`): a modal Radix Dialog generated from the same table (platform-aware Ctrl/⌘) plus the
   touch gestures; while it is open no other shortcut fires.
3. **`T` / `Shift+T`**: open the theme popover / cycle Light → Warm → Dark (toast names the theme).
4. **Phone panel = bottom sheet** (§10.3): 60 % height, grabber to expand to 92 % (drag up or tap), drag down to
   shrink then close; swipe up on the bottom bar opens it on the Annotations tab (the ☰ button keeps the last tab).
   The swipe's release is watched on `window` for that one gesture; inputs keep their own drags. The grabber acts
   on pointer release (tap = < 24 px travel) and uses `click` only for keyboard activation.
5. **Toasts** sit above the phone reader's bottom bar (`:root:has(.reader-compact)`), never over its controls.
6. **Drag selections** (mouse/pen) are published once on release, not mid-drag after the 150 ms debounce, so the
   toolbar never acts on a partial range; touch selections (handles) keep the debounce (FR-LIN-04).

## Consequences

- Double-tap zoom (P1) and Shift+arrows extension (FR-LIN-05, T-211) add bindings/gestures here.
