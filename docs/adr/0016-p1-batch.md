# ADR 0016 — M2 P1 batch (T-211)

- Status: accepted (2026-10-03)
- Requirements: FR-LIN-05, FR-LIN-08, FR-HLT-05, FR-HLT-06, FR-NOT-05, FR-NOT-06, NFR-SEC-05

## Decision

1. **Extend by lines (FR-LIN-05)**: Shift+↑/↓ grow or shrink the line range from its fixed end (`from`), within
   the page (anchors are per page). The anchor is one band per line plus one quote (`anchorFromLines`, pure and
   unit-tested). A plain J/K/arrow collapses back to one line. Touch keeps the system selection handles.
2. **Region highlight (FR-LIN-08)**: on pages flagged as having no text, a mouse/pen drag draws a rectangle that
   becomes a `region` selection (empty quote) — a separate kind, so native-selection bookkeeping never clears it.
   Touch drawing is not offered: the scroller needs `touch-action: pan-x pan-y`, and a drawing mode would have to be
   switched on before the gesture starts. Revisit with a "draw region" toggle if users ask.
3. **Change colour by clicking (FR-HLT-05)**: a click on a highlighted line selects it and the toolbar opens there
   with the highlight's colour pressed; another swatch recolours that highlight in place (same id, ADR 0011), the
   same colour removes it. No separate highlight-selection mode.
4. **Per-colour visibility (FR-HLT-06)**: each colour chip in the panel shows its count and has an eye toggle that
   hides that colour's washes in the document. It is a device-local view preference (`localStorage`, Zod-parsed,
   rule 8); hidden colours still tint note indicators and stay listed in the panel.
5. **Markdown notes (FR-NOT-05, NFR-SEC-05)**: notes stay Markdown source. A ~70-line parser covers the PRD subset
   (bold, italic, inline code, links, lists, code blocks, paragraphs) into an AST rendered as React elements:
   no HTML strings, no `dangerouslySetInnerHTML`; links only for http(s)/mailto, opened with
   `rel="noopener noreferrer"`. Chosen over a Markdown dependency for size and auditability. The panel renders
   notes; the editor and the gutter hover preview show the source.
6. **Note accent (FR-NOT-06)**: the note popover's quote rule and the panel's note rule take the line's highlight
   colour.
