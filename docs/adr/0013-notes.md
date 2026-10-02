# ADR 0013 — Notes editor, indicators and undo (T-207)

- Status: accepted (2026-10-02)
- Requirements: FR-NOT-01..03, FR-KEY-06, PRD §10.1–10.4

## Decision

1. **Editor** = a Radix Popover anchored to the line (an invisible `Popover.Anchor` over the line's rect in the
   page's over-host; content portalled, below the line so it never covers the line toolbar). `N` or the toolbar's
   Note opens the notes already on the line (`intersects`), else a new one; the line keeps its band while editing.
2. **Saving**: 500 ms after typing (`NOTE_AUTOSAVE_MS`) and on blur; Esc, outside click and Ctrl/Cmd+Enter close
   and save. A row is created with the first non-empty text, so an empty new note never exists; one emptied before
   closing is tombstoned silently. Autosaves are not undo steps: the whole editing session becomes one step when
   the editor closes (create, or old body → new body).
3. **Deleting** an existing note — by clearing its text or with its Delete button — asks inline ("Delete this
   note? Keep / Delete"), never a modal (§10.1). Keep restores the text; closing while asking keeps the stored
   note. A confirmed delete is a tombstone with an Undo toast.
4. **Indicator**: speech bubble (default) or dot (`settings.gutterStyle`), filled with the line's highlight colour
   while the accent outline keeps 3:1; count badge when notes share a line. Markers on one line (any column)
   share one gutter row and stack horizontally (`groupByLine`). A highlight with a note gets a 2 px left rule.
   Desktop hover shows the first three lines (CSS only, `(hover: hover)`); phones get a 44 px hit area.
5. **Escape and toasts**: Radix lets only the top-most dismissable layer handle Esc, and a toast that appears after
   a popover opened (e.g. "Ready to work offline") is on top. Our popovers therefore also close on their own
   `keydown` Esc; a toast and the popover may then both close, which is acceptable.

## Consequences

- FR-NOT-04 (notes in the annotation panel) lands with T-208's panel. FR-NOT-05 (Markdown) stays P1: notes are
  plain text rendered as React text, never HTML (NFR-SEC-05).
- The gutter-style choice gets its UI in T-401 (settings screens).
