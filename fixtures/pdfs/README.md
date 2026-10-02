# Test corpus (PRD Appendix B)

All committed PDFs are **generated** by `fixtures/generate.py` (PyMuPDF; `python fixtures/generate.py [--large]`),
so licensing is clean and line ground truth is known by construction (`truth/*.json`). Fonts embedded in
`11-devanagari-cjk.pdf` are MuPDF's built-in open fonts (Noto Serif Devanagari, OFL; Droid Sans Fallback, Apache-2.0).

| # | File | Purpose |
|---|---|---|
| 1 | `01-single-column-prose.pdf` | 6x9 in book, justified Times, hyphenation, block quote |
| 2 | `02-two-column-ieee.pdf`, `02b-two-column-acl.pdf` | XY-cut column order; 1.25 em and 1.55 em gutters |
| 3 | `03-textbook-sidebar-footnotes.pdf` | boxed sidebar, superscript markers, footnotes |
| 4 | `04-slides-16x9.pdf` | large text, bullets, image, dark slide, diagram labels |
| 5 | `05-tables.pdf` | grid tables (truth: one line per row) |
| 6 | `06-math.pdf` | inline super/subscripts, numbered display equations, fraction |
| 7 | `07-code.pdf` | monospace listings, indentation, line numbers |
| 8 | `08-scanned-no-text.pdf` | image-only pages (`hasTextLayer: false`) |
| 9 | `09-scanned-hidden-ocr.pdf` | page image + invisible, misaligned OCR text |
| 10 | `10-rotated-mixed.pdf` | `/Rotate` 90/0/180/270 with upright text + vertical margin stamp |
| 11 | `11-devanagari-cjk.pdf` | no-crash guarantee for Devanagari/CJK/Korean |
| 12 | `12-large-500p.pdf` | 520 pages, ~40 MB (generated with `--large`; git-ignored) |
| 13 | `13-password.pdf` | user password `marginalia` |
| 14 | `14-corrupt-truncated.pdf`, `14b-not-a-pdf.pdf` | error states, magic-byte rejection |

Truth rects use the text-layer box (`top = baseline - 0.8 * size`, `height = size`), normalised 0..1 in the
page's displayed space (intrinsic `/Rotate` applied), top-left origin.

## Real-world review corpus (not committed)

`node fixtures/fetch-real.mjs` downloads into `real/` (git-ignored) for overlay review only:

| File | Source | Licence |
|---|---|---|
| `acl-bert-N19-1423.pdf` | https://aclanthology.org/N19-1423.pdf | CC BY 4.0 |
| `acl-energy-P19-1355.pdf` | https://aclanthology.org/P19-1355.pdf | CC BY 4.0 |
| `acl-checklist-2020.pdf` | https://aclanthology.org/2020.acl-main.442.pdf | CC BY 4.0 |
| `nist-fips-180-4.pdf` | https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | US Gov work, public domain |
| `nist-sp-800-63b.pdf` | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63b.pdf | US Gov work, public domain |
| `us-constitution-pocket.pdf` | https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/pdf/CDOC-110hdoc50.pdf | US Gov work, public domain |
