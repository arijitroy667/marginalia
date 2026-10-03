# ADR 0020 — Rename, delete modes, keep offline, page layouts, distraction-free (T-408)

- Status: accepted (2026-10-03)
- Requirements: FR-LIB-07, FR-LIB-08, FR-RDR-10, FR-RDR-11, PRD §10.1

## Decision

1. **Delete** is a choice dialog, not Undo (an exception to §10.1's "undo over confirm"): both options remove a
   PDF file, which cannot be brought back from a toast. *Delete file only* removes the file here and from the
   account and turns the book into a device-mode book (annotations kept; attach to read again). *Delete everything*
   tombstones the book and all its annotations (synced) and removes file and cover; other devices drop their file
   and cover when they pull the tombstone. Removing the cloud object is best effort (offline → it stays; a
   server-side sweep of objects without a live document is the follow-up).
2. **Rename** edits the synced title. **Keep offline** pins the cached file against eviction (ADR 0019).
3. **Page layouts** (desktop): Continuous, Single page, Two pages — PDF.js's public `scrollMode` / `spreadMode`
   (`ScrollMode.PAGE`, `SpreadMode.ODD`), device-local. Overlays live in each page div, so highlights and gutter
   markers follow their page in every layout. Phones always scroll continuously.
4. **Distraction-free** (desktop): `F` (remappable) or the toolbar button hides the top bar and sidebar; Esc, `F`,
   or the top edge (hover/click, also keyboard-focusable) restores them. Phones already hide their bars while
   reading (ADR 0010).
