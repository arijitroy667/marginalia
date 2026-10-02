# ADR 0012 — Bookmarks and line navigation (T-205)

- Status: accepted (2026-10-02)
- Requirements: FR-BKM-01..03, FR-LIN-06, PRD §5 (reading line), §10.2–10.4, Appendix A

## Decision

1. **Target.** `B`, the toolbar's Bookmark button and the phone bottom bar's *Quick bookmark* toggle a bookmark on
   the line cursor, else on the **reading line** (`navigation.ts#readingLine`): the first line in reading order
   whose top edge is at or below the reading slot, on the slot's page or the next. A page without text gets a
   whole-page anchor (FR-LIN-06) and no label. "Same line" uses `intersects` (ADR 0011), so a bookmark and a
   highlight on one line are independent rows.
2. **Label** defaults to the line's first 60 characters (stored), editable in the ribbon's popover (Radix
   Popover: Esc, outside click and focus return come with it); an emptied label stores `null` and lists fall back
   to the quote. Rename and delete are undoable commands. On touch the popover does not auto-focus the input, so
   opening it does not raise the keyboard.
3. **`[` / `]`** jump to the nearest bookmark strictly before/after the reading slot, ordered by page and height
   (a bookmark within 0.5 % of a page height of the slot counts as "here"); at the ends a toast says there is none.
   Jumps (also from the Bookmarks tab) put the line at the reading slot, clear the selection and pulse the line
   for 1.2 s (§10.4; static tint with reduced motion).
4. **Delete/Backspace** on a selection removes its highlights *and* bookmarks as one undo step (Appendix A).
5. **Phone line toolbar** = swatches + Bookmark (icons only), as drawn in §10.3: Copy is the system's long-press
   callout there and a tap on blank space closes the toolbar. Desktop keeps Copy and Close.

## Consequences

- T-206 reuses `readingLine` for line-level resume: after 1 s of scroll idle the reading line's anchor (band +
  quote) is saved; hiding the tab or leaving before that resolves saves the point under the slot (zero-size rect),
  so nothing is lost. Restore puts the band's top at the slot (the same line is again the reading line) and shows a
  left-edge triangle for 2 s. T-207 adds note markers to the same gutter lane (markers on
  one line will stack, grouped with `sameLine`); T-208 folds the Bookmarks tab into the annotation panel.
- T-303 (FR-BKM-05): the synced position is one last-write-wins row per document, so each device also keeps its
  own last point device-locally (`meta['resume:<documentId>']`). On open, if the synced row is from another
  device, newer than our own point and at least one page away, the reader opens at our own point (or the top) and
  shows "Continue from {device} (p. n)? Jump / Stay" — never an automatic jump. Device labels come from
  `platform.deviceLabel()`.

