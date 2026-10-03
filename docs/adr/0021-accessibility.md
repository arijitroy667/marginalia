# ADR 0021 — Accessibility audit (T-402)

- Status: accepted (2026-10-03); screen-reader pass on real devices pending (QA checklist)
- Requirements: NFR-A11Y-01/02, FR-LIN-03, Appendix A

## Decision and evidence

1. **Automated audit** (`e2e/a11y.spec.ts`, `@axe-core/playwright` 4.13.0 — new dev dependency: the standard WCAG
   rule engine; hand-written checks could not cover it): WCAG 2.0/2.1/2.2 A and AA rules on the empty library,
   reader, line toolbar, note editor, cheat sheet, theme popover, annotation panel, library, settings and sync
   issues, in Light and in Dark, desktop and Pixel 7. **No violations.** The PDF's own text and link layers are
   excluded from colour contrast: they are transparent text over the rendered page.
2. **Touch targets** (NFR-A11Y-02, phones): every visible control is ≥ 44 × 44 CSS px, counting invisible hit
   areas (gutter markers). Fixed: colour swatches (40 → 44 px on coarse pointers), the page-number field (36 → 44 px
   tall), the palette's remove buttons (37 → 44 px), the skip link when shown.
3. **Keyboard** (NFR-A11Y-01): every action is reachable without a pointer. The gap was selecting a line: J/K now
   select the reading line when no line is selected (arrows still scroll, FR-LIN-03; Appendix A updated). E2E:
   Tab to a book, Enter, J, H, N (typing), Esc, B — all three annotation kinds created; focused controls show the
   `:focus-visible` ring. Popovers and dialogs are Radix (focus trap/return, Esc).
4. **Races fixed while repeating the suites**: a note typed and closed with the tab closing in the same instant is
   flushed on `pagehide`; distraction-free mode's Esc reads state set synchronously.

## Open

Screen readers on real devices (VoiceOver iOS/macOS, TalkBack, NVDA) — `docs/qa-checklist.md`.
