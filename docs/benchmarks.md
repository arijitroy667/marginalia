# Benchmark: add a note to a given line (NFR-PERF-06, T-406)

**Status: to be run by a person** (it measures human interaction time; it cannot be automated meaningfully).

The core thesis (PRD H1) is that Marginalia makes line-level annotation faster than general PDF readers. The
target: Marginalia's **median time is at least 2x faster** than Adobe Acrobat and one competitor. If it is not, the
PRD is revisited.

## Protocol

- **Task**: "Add the note _check this_ to line N of page P" (the line is named before the timer starts).
- **Material**: the same PDF in every app, e.g. `fixtures/pdfs/01-single-column-prose.pdf`, already open at page P.
- **Apps**: Marginalia (desktop Chrome, and phone), Adobe Acrobat (Reader, desktop), one competitor (e.g. PDF Expert,
  Xodo or Zotero's reader).
- **Trials**: 20 per app per device, line and page varied between trials; a few practice runs first, not counted.
- **Timing**: stopwatch (or screen recording) from "go" to the note being saved and visible; count the inputs
  (clicks, taps, keys excluding the typed note text).
- **Report**: median and interquartile range of time, median inputs, and any errors.

## Results

| App           | Device                                          | Median time | IQR | Median inputs | Notes |
| ------------- | ----------------------------------------------- | ----------- | --- | ------------- | ----- |
| Marginalia    | Desktop (keyboard: click line → N → type → Esc) |             |     |               |       |
| Marginalia    | Phone (tap line → Note → type → tap outside)    |             |     |               |       |
| Adobe Acrobat | Desktop                                         |             |     |               |       |
| Competitor:   |                                                 |             |     |               |       |

**Expected inputs** (PRD §2.2): Marginalia desktop 3 (click, `N`, `Esc` / `Ctrl+Enter`), phone 3 (tap line, Note,
tap outside). Acrobat: select text → comment tool / context menu → note → type → close — typically 4–5.
