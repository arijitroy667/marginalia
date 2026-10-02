# ADR 0001 — Line Engine (spike S1): GO

- Status: accepted (2026-10-02)
- Requirements: PRD §8.5, §11 S1, FR-LIN-01/06/07, NFR-PERF-07, NFR-I18N-01

## Context

A PDF has no lines (H2). The Line Engine reconstructs visual lines from PDF.js `getTextContent()` items and is
the single point of failure of the product (R1). S1 had to prove it on a corpus with numeric exit criteria.

## Decision

Keep the pure-TS geometric engine (`buildPageLines`, `hitTest`, `neighborLine`). The DOM-rect-clustering
fallback is **not** needed. Algorithm as in §8.5, with these S1 refinements:

1. **XY-cut tries a column (vertical) cut before a band (horizontal) cut, and band cuts split only at the
   single widest gap per recursion.** Horizontal-first cuts across aligned paragraph gaps in a two-column body
   and then reads band-by-band (left, right, left, right) — wrong order. Column-first fixes it.
2. **A column cut needs ≥ 2 text rows and ≥ 2 *wide* segments (≥ `minColWidth` = 4 em).** Narrow segments
   (bullets, line numbers, numeric table cells) join their nearest wide neighbour. Without this, bullets
   split from their text and tables became half-rows ("Q1 Q2" | "Q3 Q4").
3. **Tables are read as rows** (the "cell vs row" question in Appendix B #5): a row is a visual line, which
   matches "page 20, line 5". Wide multi-line cells can still split; best-effort.
4. `xCutGap` default **1.0 em** (PRD draft: 1.5). IEEE two-column gutters are ~1.25 em; 1.5 would merge columns.
   Safe because a cut also needs an empty strip across *every* row of the region and two wide sides.
5. Config (`LINE_ENGINE_CONFIG`): `yCutGap 1.0`, `xCutGap 1.0`, `minColWidth 4`, `baselineTol 0.3`,
   `overlapJoin 0.5`, `wordGap 0.15`, `pitchFallback 1.2`, `bandHeight 1.15`.

Interface changes vs the §8.5 draft (PRD updated in the same change):

- `RawTextItem.baseline` (normalised y): baseline grouping and pitch need it; a rect alone cannot recover it
  across fonts with different ascents.
- `buildPageLines(page, items, size, cfg?)`: `size` = canonical page width/height in page units, because
  thresholds are in ems (`fontSize` is in page units) while rects are normalised.
- `Line.band`: the highlight geometry (§8.5 step 7) is computed during the build (it needs neighbours), so
  it is a field instead of a `lineHighlightRect(line)` helper.

Adapter (PDF.js → `RawTextItem`): item matrix = `viewport.transform × item.transform` on the canonical
viewport (`scale: 1`, intrinsic `/Rotate`); box = text-layer span box (`top = baseline − ascentRatio ×
fontHeight`, `height = fontHeight`) with `ascentRatio = ascent / (ascent − descent)` from the textContent
style (deterministic; PDF.js's TextLayer measures a canvas font instead). Non-horizontal items (|angle| ≥ 3°)
become single-item lines with axis-aligned bounds.

## Evidence

Generated corpus (`fixtures/generate.py`, truth by construction), `pnpm tsx spikes/line-engine/report.ts`.
F1 counts a predicted line as correct when whitespace-insensitive NFKC text is equal **and** IoU ≥ 0.5.

| Group | Fixtures | F1 | Reading-order accuracy | Gate |
|---|---|---|---|---|
| single-column | 01 prose, 06 math, 07 code, 09 hidden OCR, 10 rotated | **1.000** | 1.000 | ≥ 0.97 ✅ |
| two-column | 02 IEEE (1.25 em gutter), 02b ACL (1.55 em), 03 sidebar + footnotes | **1.000** | 1.000 | ≥ 0.92 ✅ |
| other (info) | 04 slides, 05 tables (rows) | 0.958 | 0.961 | — |

- Latency (engine only, Node 22, desktop): median **0.27 ms per 3,000 chars** over 205 dense pages; max
  1.57 ms over 265 pages (gate < 30 ms ✅). Main-thread v1 is fine; no worker needed (p95 ≪ 50 ms).
- Scanned page (08) ⇒ `hasTextLayer: false` ✅. Devanagari/CJK/Korean (11), RTL and hostile input
  (NaN rects, negative sizes) do not throw ✅ (unit tests + report).
- 20 real pages hand-reviewed as PNG overlays (`spikes/line-engine/overlay.py`): 3 ACL two-column papers
  (11 pages), NIST FIPS 180-4 (4), NIST SP 800-63B (2), US Constitution pocket edition (3). Columns never
  merged; titles/authors/captions/footnotes/headers segmented; superscripts, small caps and dot-leader TOC
  rows stay whole; rotated margin stamps are single vertical lines.

## Known limitations (best-effort, acceptable for v1)

- Aligned display math (`LHS =` | `RHS`) over ≥ 2 rows can be cut at the wide gap after `=`; display
  fractions split into numerator/denominator rows.
- Definition lists and complex tables may split label and description, or mix rows/cells.
- A single row of widely spaced labels (diagram boxes, `CHAPTER 2 … Title` headers) is one line.

None of these affect stored annotations: anchors carry their own rects (§8.6), so engine changes only alter
which lines are offered for *new* selections. Bump `ENGINE_VERSION` on any segmentation change.

## Consequences (done in T-200)

- Engine: `src/core/line-engine` (pure; `tsconfig.core.json` has no DOM lib). PDF.js adapter:
  `src/features/reader/lines/textItems.ts`.
- CI gate: `src/features/reader/lines/corpus.test.ts` asserts the S1 thresholds and compares per-page goldens
  (`__goldens__/*.json`, one `region|text|rect` string per line). A golden diff = segmentation changed:
  review, bump `ENGINE_VERSION`, `vitest -u`.
- Tuning tools: `pnpm tsx scripts/line-engine-report.ts` (F1, latency, prediction dumps incl. the real corpus)
  and `python scripts/line-overlay.py` (PNG overlays); shared scorer `scripts/line-score.ts`.
- Cache: `getPageLines()` = memory LRU (50 pages) -> Dexie `lineCache[docHash+page+engine]` -> PDF.js +
  engine; never throws (FR-LIN-07).
