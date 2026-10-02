# ADR 0014 — Annotation panel (T-208)

- Status: accepted (2026-10-02)
- Requirements: FR-PNL-01, FR-NOT-04, FR-BKM-03, US-08, PRD §10.2/§10.3

## Decision

1. **Placement**: the sidebar keeps its top-level tabs Pages / Contents and gains **Annotations**, which holds the
   four FR-PNL-01 tabs (All / Highlights / Notes / Bookmarks). Six tabs do not fit a 16 rem sidebar in one row,
   and nesting keeps document navigation and annotation review apart. On phones the same panel lives in the
   sidebar drawer; the bottom sheet with swipe-up (Appendix A) belongs to the gesture map (T-210).
2. **Grouping and order**: by page, then by height on the page (document order, same as `[` `]`).
3. **Colour**: a highlight has its slot; a note takes the colour of the highlight on its line (as its gutter
   indicator does); bookmarks have none. With any colour chip on, only items of those colours show, so bookmarks
   drop out. The text filter matches quotes, note bodies and bookmark labels (case-insensitive substring).
   Filters are ephemeral component state (device-local by nature, nothing persisted).
4. **Jump**: clicking an item puts its line at the reading slot and pulses it 1.2 s; on phones the drawer closes.
5. Closing a note editor that was opened from a line selection gives the selection back, so the next `B`/`H`/`J`
   act on that line rather than the reading line.

## Consequences

- FR-HLT-06 (P1 show/hide per colour, counts) can reuse the chips. FR-PNL-02 (library-wide search) is P1.
