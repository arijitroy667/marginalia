# ADR 0011 — Highlights, palette and undo (T-204)

- Status: accepted (2026-10-02)
- Requirements: FR-HLT-01..04, FR-KEY-06, FR-THM-05, PRD §6.4, §8.7, Appendix A

## Context

Highlighting is the most frequent action (≤ 2 inputs, ≤ 1 with an active colour). The PRD fixes the data
(`color_id`, never a hex; palette with meanings in `profiles.settings`) but leaves open what "an already
highlighted line" is, how keys map to colours when the palette has gaps, and how Undo in toasts relates to
the Ctrl/Cmd+Z stack.

## Decision

1. **Palette** = `settings.palette`: 1–8 `{ id, hex, label ≤ 24 }`, unique ids, default five meanings
   (Zod-validated in `SettingsSchema`). Hexes are written as `--hl-<id>` CSS variables; the theme supplies
   blend and alpha (`multiply`/1 in Light and Warm, `normal`/0.38 in Dark). A `color_id` missing from the
   palette renders neutral grey, never black. `highlightContrast(theme, hex)` composites the wash over page
   text and paper; every default colour holds ≥ 4.5:1 in every theme (unit test; the T-401 editor warns).
2. **Active colour** (what `H` applies) is device-local (`localStorage` UI pref, rule 8): the last colour applied,
   or the one chosen with `1`–`8` when no line is selected. **Key N = the Nth swatch** in the toolbar
   (position, not slot id), so keys match what the user sees after palette edits.
3. **"Already highlighted"** = a live highlight that `intersects` the selection: some rect pair overlaps
   horizontally and vertically by ≥ half the smaller height (the Line Engine's same-line rule). The other
   column at the same height never matches. Same colour ⇒ tombstone; other colour ⇒ update `color_id` in place
   (same id); none ⇒ create. A native selection is consumed after colouring; a line selection stays so `J`/`K`
   + `H` can continue.
4. **Undo** is a command stack (`features/reader/commands.ts`): 50 steps, in memory, cleared when another
   document opens. Every command is a `{ undo, redo }` pair of repository writes, so undoing a delete
   restores the same id and the outbox carries it (sync converges). Commands run strictly one at a time, so a
   double key press cannot create two rows. A toast's Undo reverts *its* step: like Ctrl/Cmd+Z when it is the
   latest (then redoable), otherwise it is reverted and dropped from history. Replace and remove show the
   toast; create does not (the wash is the feedback).
5. **Toolbar placement**: centred on the page above the line (below touch selections, ADR 0004); when that
   side is covered (phone top bar, viewport edge), checked with `elementFromPoint` before paint, it takes the
   other side. Swatches are 40 px wide toggle buttons (`aria-pressed` = colour on the line).

## Evidence

- `src/features/reader/commands.test.ts`: create/replace/remove, two-column and next-line non-matches,
  serialised double press, undo/redo chains, 50-step cap, toast-undo semantics, multi-highlight Delete.
- `e2e/highlight.spec.ts` (Chromium, Pixel 7): swatches + toast Undo + reload; `H`, digits, `Delete`,
  Ctrl+Z / Ctrl+Shift+Z; a three-line native selection becomes one highlight with three rects.
- Dark-theme contrast of text under the default colours: 4.8–5.3:1 (≥ 4.5).

## Consequences

- T-205 (bookmarks) and T-207 (notes) add their own commands to the same stack; `Delete` will also remove the
  line's bookmark.
- Overlapping highlights of different colours on one line are possible via partial selections; the toolbar
  shows the first as pressed. Revisit if users find it confusing (P1 FR-HLT-05 recolours by clicking a wash).
