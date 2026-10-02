# PRD: Marginalia — a line-level PDF reader (Web + Mobile PWA)

| Field | Value |
|---|---|
| Status | Draft v1.0, ready for Claude Code kickoff |
| Date | 2026-10-02 |
| Owner | Ariz (Arijit Roy) |
| Working title | **Marginalia** (rename freely; keep the name in one constant, `APP_NAME`) |
| Platforms | Desktop browsers + installable PWA on Android and iOS; architecture kept Capacitor-ready |
| Backend | Supabase (Postgres + Auth + Storage), cloud accounts from v1.0 |
| Formats | PDF only (v1) |
| Audience | Personal tool first; architecture product-ready |

---

## 0. How to use this document with Claude Code

1. Save this file as `docs/PRD.md` and the companion `CLAUDE.md` at the repo root. Claude Code loads `CLAUDE.md` every session; it points back here.
2. Work **one milestone task at a time** (§11). Kickoff prompt template: *"Read docs/PRD.md §8 and §11. Implement task T-2xx only. Plan first, list the files you will touch, then implement with tests."*
3. Every requirement has a stable ID: `FR-*` (functional), `NFR-*` (non-functional), `T-*` (task), `S*` (spike), `R*` (risk). Reference IDs in commit messages and PR descriptions (`Implements FR-HLT-01`).
4. Priorities: **P0** = v1.0 blocker, **P1** = v1.0 should-have, **P2** = after v1.0. Do not build P2 before M4 exit.
5. If the PRD and the code disagree, or a requirement is ambiguous, **stop and ask**, then update the PRD in the same PR. The PRD is the source of truth, not the code.
6. Normative words: MUST / MUST NOT / SHOULD are used in the RFC 2119 sense.

---

## 1. Product thesis

### 1.1 Problem

Readers like Adobe Acrobat and Kindle treat the **page** (or an arbitrary mouse selection) as the unit of interaction. A human reading a book thinks in **lines and sentences**: "page 20, line 5, that sentence." The friction today is not that other apps *cannot* highlight or annotate. It is that doing so costs several steps and a modal, the results live in separate panels, and colour, notes and bookmarks are not one coherent model.

### 1.2 Product

A deliberately simple book-style PDF reader where the **line** is a first-class object:

1. One tap/click selects any line; one more action highlights it, bookmarks it, or attaches a note to it.
2. Highlight **colours carry user-defined meanings** (e.g. yellow = key idea, green = definition).
3. A **bookmark per line** and automatic **resume-to-the-line** when you reopen a book, on any device.
4. A **note per line** with a visible marker in the margin; click the marker to expand the quoted line and your note.
5. **Themes (Light / Warm / Dark) recolour the document itself**, not just the app chrome.
6. Same data on browser and phone via accounts + sync.

Everything else is a standard PDF reader (page nav, zoom, search, outline, thumbnails).

### 1.3 Hard truths (read before building)

These are deliberate, numerically-grounded corrections to assumptions in the original idea. Claude Code MUST treat them as design constraints.

| # | Reality | Consequence for this PRD |
|---|---|---|
| H1 | **Acrobat and Kindle can already highlight, annotate and bookmark.** "They cannot" is false and is a weak pitch. What they lack is *speed and unity*: attaching a note to a line in Acrobat is typically a select → toolbar/context-menu → comment → type sequence (an estimate to be measured, see NFR-PERF-06). | The moat is **interaction cost + one unified annotation model + sync**. Success is measured in inputs-per-action (§2.2), not feature checklists. Before polishing, spend 30 minutes using Xodo, PDF Expert, Zotero's reader and Readwise Reader on a real book; steal what works. |
| H2 | **A PDF has no concept of a "line".** It stores positioned glyph runs. PDF.js `getTextContent()` returns text *items* (`str`, `transform`, `width`, `height`, `hasEOL`), which are not lines. Multi-column layouts, footnotes, superscripts, tables and hyphenation all break naive grouping. | The **Line Engine** (§8.5) is the single point of failure of the whole product. It is built and gated first (Milestone M0, spike S1) with numeric exit criteria. Everything else here is commodity. |
| H3 | **"Press Alt+Ctrl to bookmark" is not viable.** Modifier-only chords cannot be bound reliably in browsers, `Ctrl+Alt` equals `AltGr` on many European layouts, and phones have no keyboard. | Default quick-bookmark is the single key **`B`** (when no text field is focused) plus an on-screen button on touch. Rebindable (FR-KEY-04). Modifier-only chords are explicitly unsupported. Browser-reserved combos (`Ctrl+D`, `Ctrl+B` in Firefox, `Alt+letter` menus) are avoided. |
| H4 | **"The whole PDF changes theme" is only partly achievable.** PDF.js paints to a `<canvas>`; pixels cannot be restyled. Vector text/paths can be recoloured at render time, but embedded images and scanned pages cannot. A naive `invert()` filter inverts photos and diagrams too. | Theme engine (§8.7). Spike S2 (ADR 0002) found PDF.js 6.3.289's `pageColors` is a whole-canvas posterizing filter, so v1 uses one CSS-filter strategy with exact token colours, restoring image regions from the unfiltered canvas in dark themes; scanned pages stay inverted. |
| H5 | **A4 / two-column PDFs on a 6" phone are miserable regardless of the app.** Fit-width text is roughly 5 to 6 pt. True reflow of arbitrary PDFs is a research-grade problem. | Reflow is a non-goal for v1. Phone UX relies on fit-width + fast pan/zoom + (P2) column-snap smart zoom. If the phone becomes the primary device, reconsider EPUB (v2). |
| H6 | **Cloud-from-day-1 on Supabase's free tier has hard ceilings**: about 1 GB file storage (~20 books at 50 MB), 5 GB egress/month (~100 full 50 MB downloads), and projects **pause after ~7 days of inactivity** (verified against supabase.com/pricing on 2026-10-02: 1 GB storage, 50 MB max upload, 5 GB egress, pause after 1 week; ADR 0005). The free plan also caps a single upload (reported 50 MB; verify). | Per-document `storage` mode (`cloud` | `device`) so annotations sync even when the file does not; local blob cache to cut egress; `MAX_CLOUD_FILE_BYTES` config; budget for Pro if this becomes daily-driver infrastructure. |
| H7 | **iOS PWAs are second-class**: no Background Sync API, no `beforeinstallprompt` (install is manual via Share → Add to Home Screen), and Safari *tab* storage can be evicted after ~7 days without interaction (installed home-screen apps are exempt). | Sync runs only while the app is open/foreground; cloud is the source of truth; call `navigator.storage.persist()`; in-app install helper (M4). |
| H8 | **Last-write-wins loses concurrent edits.** | Acceptable for a single user on several devices; documented and tested (FR-SYN-08). Note revision history is P2. |

---

## 2. Goals, non-goals, success metrics

### 2.1 Goals

- G1: Make annotating at **line granularity** the cheapest operation in the reader.
- G2: Never lose a user's annotation or reading position (offline-safe, crash-safe, tab-kill-safe).
- G3: One consistent experience on desktop browser and phone (installable PWA).
- G4: Keep the codebase small enough for one developer + Claude Code to own.

### 2.2 Success metrics (measured by Playwright timing tests and a manual stopwatch protocol)

| Metric | Target |
|---|---|
| Highlight a whole line | ≤ 2 inputs (select line, pick colour); ≤ 1 input when an active colour is set and a line is already selected |
| Create a note on a line | ≤ 3 inputs from reading state to typing (select line, `N`/Note, type) |
| Quick-bookmark | 1 input (`B` or one tap on the bookmark button) |
| Annotation visible after input | < 100 ms (optimistic write to IndexedDB, then sync) |
| Resume | Reopen a cached document and land within ±1 viewport of the last line in < 2 s p50 |
| Cross-device propagation | ≤ 5 s while both online (P1 realtime); on next foreground otherwise |
| Data loss | 0 annotations lost across offline use, tab kill, crash, reload |
| Line Engine quality | See S1 exit criteria (§11, M0) |

### 2.3 Non-goals (v1)

EPUB/MOBI/other formats; AI features (summaries, chat, auto-tagging); sharing, collaboration, public links; PDF editing, form filling, signing; OCR (P2); text-to-speech; DRM-protected PDFs; native store apps (PWA first; Capacitor wrapper is P2); RTL/vertical-script line semantics (must not crash, best-effort only); reflow mode.

---

## 3. Users and scenarios

**Primary persona: Ariz** — an engineering student who reads textbooks, papers and specs on a laptop and a phone, and wants a thinking-while-reading tool with fast annotations.

| ID | User story |
|---|---|
| US-01 | I add a PDF once and see it in my library on every device. |
| US-02 | I reopen a book and land on the exact line where I stopped. |
| US-03 | I highlight a line in one action. |
| US-04 | I choose a highlight colour, and that colour means something I defined. |
| US-05 | I bookmark a line with one key or one tap. |
| US-06 | I write a note on a line, later see a marker there, and click it to read the quote and my note. |
| US-07 | I switch to warm or dark mode and the document itself changes. |
| US-08 | I review all highlights/notes/bookmarks of a book, filter by colour meaning, and jump back to any of them. |
| US-09 | I export my notes and highlights as Markdown. |
| US-10 | I keep reading on my phone with no signal and my annotations sync later. |

---

## 4. Locked product decisions

| Decision | Choice | Why | Rejected |
|---|---|---|---|
| Client platform | **One React + TypeScript codebase, PWA first, Capacitor-ready** | One codebase for browser and phone; PDF.js runs in every modern browser; Capacitor can wrap it later for stores | React Native / Flutter: weak PDF text-layer and selection APIs, two codebases, 2x cost |
| PDF engine | **`pdfjs-dist` (PDF.js) `PDFViewer` component** | Mature text layer, find controller, outline, link service, form/annotation layers, worker rendering; do not write a virtualizer | `react-pdf` (too little control over overlays), custom renderer (months of work) |
| Backend | **Supabase**: Postgres + Row Level Security + Auth + Storage (+ Realtime P1) | Solo-dev friendly, SQL, RLS gives multi-tenant safety from day one | Firebase (NoSQL for relational annotation queries), custom server |
| Data flow | **Local-first client + cloud source of truth**: UI reads only IndexedDB (Dexie); a sync engine mirrors to Supabase | Instant UI, offline reading, sync layer swappable without UI change | Direct-to-Supabase UI (latency, breaks offline) |
| Formats | PDF only | "Page 20, line 5" is well-defined on PDFs; EPUB needs a second anchoring/rendering engine | PDF + EPUB in v1 (~2x scope) |
| Accounts | Cloud accounts at v1.0; **auth + schema + RLS ship in M1 (day 1)**, sync engine in M3 | Because the UI reads only IndexedDB, sync slots in later with zero UI change; debugging sync conflicts against a still-moving annotation model wastes time | Literal sync-in-first-commit |
| Audience | Personal tool, product-ready architecture | RLS, private storage, export, deletion paths from the start; no billing/teams in v1 | Public launch scope |

---

## 5. Concepts and glossary

| Term | Definition |
|---|---|
| **Line** | A visual row of text on a page as reconstructed by the Line Engine (not a PDF primitive). Volatile: depends on engine version. |
| **Anchor** | The durable address of an annotation: page + normalised rectangles + text quote (+ volatile hints). See §8.6. |
| **Annotation** | A row with a `kind`: `highlight`, `note`, or `bookmark`, each with an Anchor. Independent rows; the UI groups them by line. |
| **Reading line** | The line used for auto-resume and quick-bookmark when no line is selected: the first line whose top edge is at or below the viewport top inset (chrome height + 8 px). |
| **Line cursor / Line focus** | The currently selected line (click/tap or ↑/↓), which shows the line toolbar. |
| **Palette** | The user's highlight colours (1 to 8), each with `hex` and a `label` (its meaning). Annotations store `color_id`, never a raw hex. |
| **Gutter** | The margin lane at the page's right edge holding note/bookmark markers. |
| **Resume point** | One row per document: last reading line + progress + device label; last-write-wins. |
| **Document identity** | SHA-256 of the file bytes (`content_hash`). Same file on two devices = same document. |
| **Theme strategy** | The mechanism that recolours rendering: a composite-time CSS filter on the page canvas, with image restore in dark themes (ADR 0002). |

---

## 6. Functional requirements

Each row is independently testable. "AC" = acceptance criteria. Test each AC with unit or Playwright tests where feasible (§12).

### 6.1 Library and documents (`FR-LIB`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-LIB-01 | P0 | Add a PDF via file picker and (desktop) drag-and-drop. | Accepts `application/pdf` **and** magic bytes `%PDF-`; rejects others with a clear message; rejects files over `MAX_FILE_BYTES` (default 200 MB). Password-protected PDFs prompt for a password (PDF.js `PasswordException`); the password is never stored. |
| FR-LIB-02 | P0 | Document identity by streaming SHA-256 of file bytes. | Hash computed incrementally (no full-file `ArrayBuffer` for >50 MB; use an incremental hasher, not `pdfDocument.fingerprints`, which can be weak when a file lacks a trailer `/ID`). Adding the same bytes twice opens the existing document instead of duplicating. |
| FR-LIB-03 | P0 | Extract metadata and cover. | Title (PDF metadata → filename fallback), author, page count, first-page thumbnail (WebP ≤ 320 px wide, ≤ 40 KB) stored locally and synced. |
| FR-LIB-04 | P0 | Library screen: grid/list toggle, cover, title, progress %, last opened; sort by last opened / title / added; title search. | 500 documents render without jank (virtualised list); empty state explains how to add a PDF. |
| FR-LIB-05 | P0 | Per-document storage mode: `cloud` (default) or `device`. | `cloud`: file in Supabase Storage. `device`: only annotations/metadata sync; on another device the user is asked to "Attach file", and the app verifies SHA-256 equality before linking. Files over `MAX_CLOUD_FILE_BYTES` default to `device` with an explanation. A storage quota meter is visible. |
| FR-LIB-06 | P0 | Open flow on a device without the file. | `cloud`: download with progress + cancel + resume, cache as Blob in IndexedDB. `device`: attach prompt. Never a blank screen. |
| FR-LIB-07 | P1 | Rename title; delete document. | Delete offers "Delete file only (keep my annotations)" and "Delete everything". Soft-delete (tombstone) so deletion syncs. |
| FR-LIB-08 | P1 | Offline availability. | LRU cache of the last N documents (default 5, budget `OFFLINE_CACHE_BYTES` default 500 MB) with a per-document "Keep offline" pin. |

### 6.2 Standard reader features (`FR-RDR`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-RDR-01 | P0 | Continuous vertical scroll, virtualised. | Rendered canvases are limited to PDF.js's page-view LRU (`max(10, 2·visible+1)`), each capped by `maxCanvasPixels` (NFR-PERF-04, ADR 0003). |
| FR-RDR-02 | P0 | Page navigation: page-number input, prev/next, Home/End, PgUp/PgDn, scrubber on mobile. | `G` focuses page input. Invalid input is ignored with feedback. |
| FR-RDR-03 | P0 | Zoom: fit-width (default), fit-page, 50 to 400 %, `Ctrl/Cmd+wheel`, `Ctrl/Cmd +/-/0`, pinch on touch. | Pinch uses CSS transform during gesture and re-renders on release; no canvas exceeds NFR-PERF-04. Zoom is device-local (not synced). |
| FR-RDR-04 | P0 | Thumbnails sidebar. | Lazy; current page highlighted; click jumps. |
| FR-RDR-05 | P0 | Outline / table of contents. | Rendered from `getOutline()`; nested; click jumps to destination; hidden if the PDF has none. |
| FR-RDR-06 | P0 | In-document text search (`Ctrl/Cmd+F`, `/`). | Uses PDF.js `PDFFindController`; match count, next/prev (`Enter`/`Shift+Enter`), match highlight distinct from user highlights, case-insensitive default. |
| FR-RDR-07 | P0 | Native text selection and copy. | Text layer is selectable; copy preserves line breaks reasonably. |
| FR-RDR-08 | P0 | Links: internal jumps + external links. | External links open in a new tab with `rel="noopener noreferrer"`; browser Back returns to prior position after an internal jump (history entries for jumps). |
| FR-RDR-09 | P0 | Rotate view in 90° steps. | Stored anchors are unrotated-space and stay correct (property test in §12). |
| FR-RDR-10 | P1 | Single-page and two-page-spread modes (desktop). | Annotations and gutter align in all modes. |
| FR-RDR-11 | P1 | Distraction-free mode. | Hides chrome; tap/click edge or `Esc` restores. |
| FR-RDR-12 | P0 | Error states: corrupt, unsupported, wrong password, offline-without-cache. | Each has human-readable copy and a recovery action. |
| FR-RDR-13 | P2 | Render embedded PDF form/annotation layers; print. | Behind a flag. |

### 6.3 Line interaction (`FR-LIN`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-LIN-01 | P0 | Every text line is hit-testable. Desktop hover shows a faint band (120 ms delay); click/tap selects the line and shows the **line toolbar**: `[colour swatches] [Note] [Bookmark] [Copy] [Close]`. | Hit test tolerance snaps clicks in inter-line gaps to the nearest line within half the line pitch. |
| FR-LIN-02 | P0 | Tap-vs-drag disambiguation. | Pointer travel < 4 px (mouse) / < 10 px (touch) and < 300 ms ⇒ line select. Otherwise native text selection takes over. Long-press on touch ⇒ native word selection. |
| FR-LIN-03 | P0 | Line cursor navigation. | With a line selected, ↑/↓ (and `J`/`K`) move line by line across columns/pages, auto-scrolling with a margin; `Esc` clears; with no cursor, arrows scroll normally. |
| FR-LIN-04 | P0 | Arbitrary text selection shows the same toolbar. | Annotation created from a selection stores one rect per visual line fragment (sub-line precision). |
| FR-LIN-05 | P1 | Extend selection by lines: `Shift+↑/↓`; touch drag handles. | Produces a multi-rect anchor. |
| FR-LIN-06 | P0 | Pages without a text layer (scanned). | Page shows an unobtrusive banner "No selectable text on this page"; line features disabled on that page; bookmarks/resume still work at page level (rect = whole page). |
| FR-LIN-07 | P0 | Engine failure fallback. | If hit-testing returns null, native selection still works; no exception reaches the user. |
| FR-LIN-08 | P1 | Region highlight for scanned pages (rectangle drag). | Stored as an Anchor with empty quote. |

### 6.4 Highlights and palette (`FR-HLT`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-HLT-01 | P0 | Highlight a line. | ≤ 2 inputs; ≤ 1 with an active colour (`H` or tapping the active swatch). Drawn in an overlay (SVG/DOM) layer, never baked into the canvas. |
| FR-HLT-02 | P0 | Default palette of 5 with meanings: Yellow "Key idea", Green "Definition", Blue "Look up", Pink "Disagree / doubt", Purple "Revisit". Up to 8 colours. | Labels ≤ 24 chars; hex editable; contrast of text under every highlight ≥ 4.5:1 in every theme, validated at edit time with a warning. |
| FR-HLT-03 | P0 | Same colour on an already highlighted line removes it; a different colour replaces it. | Toast with Undo (FR-KEY-06). |
| FR-HLT-04 | P0 | Remove a highlight via toolbar, `Delete`/`Backspace`, or the panel. | Tombstoned for sync. |
| FR-HLT-05 | P1 | Change colour of an existing highlight by clicking it. | Toolbar opens on the highlight. |
| FR-HLT-06 | P1 | Show/hide highlights per colour meaning; counts per colour in the panel. | Toggle is device-local. |
| FR-HLT-07 | P2 | Per-meaning underline style (solid/wavy/dashed) for colour-blind accessibility. | |

### 6.5 Bookmarks and resume (`FR-BKM`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-BKM-01 | P0 | **Quick bookmark**: `B` (desktop) / bookmark button (touch) bookmarks the line cursor, or else the reading line. | Pressing again on the same line removes it (toast with Undo). Ignored while a text field is focused or IME composing. |
| FR-BKM-02 | P0 | Bookmark marker (ribbon icon) in the gutter at the line; optional label; default label = first 60 chars of the line. | |
| FR-BKM-03 | P0 | Bookmarks list in the sidebar: page, snippet, label, created. | Click jumps and flashes the line for 1.2 s. `[` and `]` jump to previous/next bookmark. |
| FR-BKM-04 | P0 | **Auto resume point**: save `{page, reading-line anchor, progress}` after 1 s of scroll idle, on `visibilitychange:hidden` and `pagehide`. | On open: scroll so the line sits at the reading-line slot; show a transient resume marker (left-edge triangle, 2 s). |
| FR-BKM-05 | P0 | Cross-device resume prompt. | If the synced resume point is from a different device, newer, and its page differs by ≥ 1, show "Continue from {device} (p. {n})? [Jump] [Stay]". Never auto-jump. |
| FR-BKM-06 | P1 | Rebindable quick-bookmark key. | See FR-KEY-04; modifier-only chords rejected with an explanation (H3). |

### 6.6 Notes and indicators (`FR-NOT`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-NOT-01 | P0 | Add a note: `N` or toolbar. Opens an inline popover anchored to the line with the quoted text (2-line clamp) and a textarea (auto-focus). | Autosave on 500 ms debounce, on blur, and on close. `Esc` closes (saved). `Ctrl/Cmd+Enter` saves and closes. An empty new note is discarded silently; deleting existing content asks for confirmation. |
| FR-NOT-02 | P0 | Note indicator in the gutter at the line. Style setting: speech bubble (default) or dot. Tinted with the line's highlight colour if any; count badge when several notes share a line. | Visible without hover; ≥ 24 px target on desktop, ≥ 44 px hit area on touch. |
| FR-NOT-03 | P0 | Click/tap the indicator ⇒ popover with quoted line and editable note. Desktop hover previews the first 3 lines. | Popover is keyboard reachable and dismissible. |
| FR-NOT-04 | P0 | Notes appear in the annotation panel grouped by page with quote, text, colour chip, timestamp. | |
| FR-NOT-05 | P1 | Markdown in notes (bold, italic, lists, code, links), rendered safely. | Stored as Markdown source; **no raw HTML** (see NFR-SEC-05). |
| FR-NOT-06 | P1 | Notes on a highlighted line inherit the highlight colour as an accent. | |
| FR-NOT-07 | P2 | Tags and note revision history. | Mitigates H8. |

### 6.7 Themes (`FR-THM`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-THM-01 | P0 | Built-in themes: **Light**, **Warm** (sepia paper), **Dark**, plus *System* (follows `prefers-color-scheme`). P1: **Night-warm** (dark + warm). | |
| FR-THM-02 | P0 | Theme recolours the **document rendering** and app chrome. | Dark text PDFs: light text on dark background with images not colour-inverted (image regions restored, ADR 0002). Scanned/image-only pages are inverted. An "Invert images" toggle overrides (default ON for scanned, OFF for text PDFs). |
| FR-THM-03 | P0 | **Warmth** slider 0 to 100 % (colour-temperature overlay, `mix-blend-mode: multiply`, `pointer-events: none`) available in every theme. P1: brightness dimmer 50 to 100 %. | Overlay never blocks input. |
| FR-THM-04 | P0 | Changing theme MUST NOT re-fetch or re-parse the PDF. | Visible pages update < 300 ms (NFR-PERF-05). |
| FR-THM-05 | P0 | Highlights, gutter icons, toolbars stay legible in every theme (per-theme tokens). | Contrast ≥ 3:1 for icons, ≥ 4.5:1 text-over-highlight. |
| FR-THM-06 | P0 | Global default theme + P1 per-document override. | Persisted and synced in `profiles.settings`. |
| FR-THM-07 | P0 | `meta theme-color` and PWA splash follow the theme. | |

### 6.8 Annotation panel and search (`FR-PNL`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-PNL-01 | P0 | Sidebar tabs: Bookmarks, Highlights, Notes, All; grouped by page; colour filter chips with meaning labels; text filter over quotes and notes. | Click jumps to the anchor. Empty states per tab. |
| FR-PNL-02 | P1 | Library-wide annotation search. | Runs against IndexedDB; returns document + page + snippet. |
| FR-PNL-03 | P1 | Export from the panel (FR-EXP). | |

### 6.9 Keyboard and gestures (`FR-KEY`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-KEY-01 | P0 | Default keymap per Appendix A. | |
| FR-KEY-02 | P0 | Single-key shortcuts MUST NOT fire when a text input/textarea/contenteditable has focus, during IME composition, or with unrelated modifiers held. | Unit-tested key router. |
| FR-KEY-03 | P0 | `?` opens a shortcut cheat-sheet. | |
| FR-KEY-04 | P1 | Remap shortcuts; conflict detection; modifier-only chords rejected; reset to defaults. | |
| FR-KEY-05 | P0 | Mobile gesture map per Appendix A (tap line, tap blank to toggle chrome, long-press select, pinch zoom, bottom sheet). | |
| FR-KEY-06 | P0 | Undo/redo for annotation operations (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`), 50-step in-memory stack, plus Undo in toasts. | Undo of a delete restores the same `id` (so sync converges). |

### 6.10 Accounts, sync and offline (`FR-SYN`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-SYN-01 | P0 | Auth via Supabase: email magic link + Google OAuth; persistent session. | Sign-out offers "Remove data from this device". |
| FR-SYN-02 | P0 | Local-first writes. | Every mutation commits data **and** an outbox row in one Dexie transaction before the UI confirms. |
| FR-SYN-03 | P0 | Push: outbox flushes on online/foreground/5 s after enqueue/30 s timer; exponential backoff; idempotent upserts keyed by client-generated UUID; same-entity upserts coalesce. | No outbox item is dropped silently. |
| FR-SYN-04 | P0 | Pull: keyset cursor `(updated_at, id)` per table with a 5 s overlap window; apply by last-write-wins. | Rows with a pending outbox entry are **not** overwritten by pull. |
| FR-SYN-05 | P0 | Sync status indicator: Synced / Syncing / Offline (n pending) / Error (retry). | |
| FR-SYN-06 | P1 | Supabase Realtime subscription for `annotations` and `reading_positions`. | ≤ 5 s propagation. |
| FR-SYN-07 | P0 | PDF blob sync: resumable (TUS) upload for files > 6 MB, signed-URL download with progress, IndexedDB Blob cache with LRU. | Calls `navigator.storage.persist()` on first document add. |
| FR-SYN-08 | P0 | Conflict policy = whole-row last-write-wins by **server** `updated_at`. | Documented in code and tested: concurrent edit, edit-vs-delete, offline-both-sides. |
| FR-SYN-09 | P0 | **Duplicate-document merge**: if two devices add the same file offline, the second push hits the unique `(user_id, content_hash)` and the client adopts the existing document `id`, remaps local annotations/positions, and retries. | E2E test with two offline contexts. |
| FR-SYN-10 | P0 | "Sync issues" screen lists failed outbox items with the error, retry, and export-as-JSON. | |
| FR-SYN-11 | P2 | Account deletion and full data export. | |

### 6.11 Export (`FR-EXP`)

| ID | Pri | Requirement | AC |
|---|---|---|---|
| FR-EXP-01 | P1 | Per-document Markdown export grouped by page: `> quote`, note, colour label, bookmark list. | Deterministic output; snapshot-tested. |
| FR-EXP-02 | P1 | Full JSON export, schema-versioned (`"schema": 1`). | |
| FR-EXP-03 | P2 | Flattened/annotated PDF export (`pdf-lib`: highlight + text annotations). | |
| FR-EXP-04 | P2 | JSON import and "relink to a new file revision" by fuzzy quote matching. | |

### 6.12 Settings (`FR-SET`)

| ID | Pri | Requirement |
|---|---|---|
| FR-SET-01 | P0 | Palette editor (colours, labels), default theme, warmth, gutter icon style. |
| FR-SET-02 | P1 | Shortcut remap, offline cache budget, default zoom mode. |
| FR-SET-03 | P0 | Account section (email, sign out, storage usage). |

---

## 7. Non-functional requirements

Numeric targets are **initial budgets**: measure in the spikes, then tighten or relax with an ADR (architecture decision record in `docs/adr/`).

| ID | Area | Requirement |
|---|---|---|
| NFR-PERF-01 | Open | Cached 300-page / 20 MB text PDF: first page visible < 1.5 s on desktop, < 3 s on a mid-range Android phone. |
| NFR-PERF-02 | Scroll | 60 fps desktop, ≥ 45 fps mobile while scrolling a 300-page text PDF. |
| NFR-PERF-03 | Annotation | Input to visible annotation < 100 ms (optimistic IndexedDB write; network never on the critical path). |
| NFR-PERF-04 | Memory | Rendered canvases only within PDF.js's page-view LRU (`max(10, 2·visible+1)`; ADR 0003). Each canvas ≤ **16,777,216 px** (iOS Safari canvas area ceiling); device-pixel-ratio capped at 2 on mobile, 3 on desktop; release off-screen canvases by setting `width = height = 0` (Safari does not free backing stores otherwise). Target: peak JS heap + canvases < 300 MB on a 500-page PDF on a phone. |
| NFR-PERF-05 | Theme | Theme switch updates visible pages < 300 ms; CSS-strategy switch is effectively instant. |
| NFR-PERF-06 | Benchmark | In M4, run a stopwatch protocol (20 trials each): "add a note to a given line" in Marginalia vs Acrobat vs one competitor. Record in `docs/benchmarks.md`. Marginalia must be ≥ 2x faster median, or the core thesis (H1) is not met and the PRD is revisited. |
| NFR-PERF-07 | Line Engine | Median < 30 ms per 3,000-character page on desktop, < 80 ms on a mid-range phone. v1 runs on the main thread in idle-time chunks; move to a Web Worker if p95 > 50 ms. Results cached per `(content_hash, page, engine_version)`. |
| NFR-PERF-08 | Bundle | Initial app-shell JS ≤ 250 KB gzip excluding PDF.js; PDF.js and its worker lazy-load on the reader route. |
| NFR-PERF-09 | Sync | Initial pull of 5,000 annotations < 3 s on a typical connection; pushes batched ≤ 100 rows per request. |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA for app chrome; every action reachable by keyboard; visible `:focus-visible`; `prefers-reduced-motion` respected; icon-only buttons have accessible names; toasts use `aria-live="polite"`. |
| NFR-A11Y-02 | Touch | Touch targets ≥ 44 × 44 CSS px. |
| NFR-SEC-01 | Tenancy | Row Level Security on **every** table and on `storage.objects`; policies use `(select auth.uid())`; an automated two-user test proves user B cannot read or write user A's rows or files. |
| NFR-SEC-02 | Secrets | No service-role key in the client, repo, or CI logs. Only the anon key + project URL ship to the browser. `.env.example` documents variables. |
| NFR-SEC-03 | Untrusted input | Uploaded PDFs are untrusted. Pin `pdfjs-dist` at or above the fix for CVE-2024-4367 (fixed in 4.2.67; re-verify for the version you install), set `isEvalSupported: false`, keep rendering in the PDF.js worker, and upgrade deliberately (R9). |
| NFR-SEC-04 | CSP | Strict Content-Security-Policy (no `unsafe-eval`; check whether PDF.js image decoders need `wasm-unsafe-eval`); verified in CI by loading the built app and a corpus PDF with the CSP enforced. |
| NFR-SEC-05 | XSS | Note Markdown rendered without raw HTML; links `rel="noopener noreferrer"`; no `dangerouslySetInnerHTML` outside a reviewed sanitiser wrapper. |
| NFR-SEC-06 | Privacy | PDF contents, quotes and notes never appear in logs, analytics or error reports (scrub in the error-reporting `beforeSend`). No third-party trackers. |
| NFR-SEC-07 | Supply chain | `pnpm audit` and a lockfile check in CI; new dependencies need a one-line justification in the PR. |
| NFR-REL-01 | Durability | Zero annotation loss across offline use, tab kill, crash, reload (E2E "kill the page mid-edit" test). |
| NFR-REL-02 | Migrations | Forward-only SQL migrations in `supabase/migrations`; Dexie schema versioned with upgrade functions; Anchor and export schemas carry a version field. |
| NFR-COMPAT-01 | Browsers | Last 2 versions of Chrome, Edge, Firefox; Safari / iOS Safari ≥ 16.4; Chrome on Android. Automated: Chromium + WebKit (Playwright). Manual: one real Android phone and one real iPhone before each milestone exit. |
| NFR-I18N-01 | Language | English UI for v1 with all strings in `src/shared/i18n/en.ts` (no inline literals in components). Non-Latin and Indic-script PDFs MUST NOT crash the engine; line semantics are best-effort for left-to-right scripts. |

---

## 8. Technical architecture

### 8.1 System overview

```
┌──────────────────────────── Browser / PWA (React + TypeScript) ───────────────────────────┐
│                                                                                            │
│  UI features/*  ── reads ──►  Dexie liveQuery  ◄── writes ──  Repositories                  │
│     │                              ▲   │ (data + outbox in ONE transaction)                │
│     ▼                              │   ▼                                                   │
│  Reader                       Sync Engine ── push outbox / pull deltas / blob transfer      │
│   ├ PDF.js PDFViewer (canvas)       │                                                       │
│   ├ PDF.js text layer (selection)   ▼                                                       │
│   ├ Line Engine (pure TS)      Supabase JS client (core/supabase only)                      │
│   └ Overlay layer (SVG: highlights, hover band, gutter markers)                             │
└────────────────────────────────────┼───────────────────────────────────────────────────────┘
                                     ▼
              Supabase: Auth · Postgres (RLS) · Storage (private bucket) · Realtime (P1)
```

### 8.2 Hard layering rules (Claude Code MUST follow)

1. `src/core/line-engine` and `src/core/anchors` are **pure TypeScript**: no React, no DOM, no Supabase, no PDF.js types beyond a thin `RawTextItem` interface. 100 % unit-tested.
2. UI code MUST NOT import `@supabase/supabase-js`. Only `src/core/sync`, `src/core/auth` and `src/core/supabase` may.
3. UI **reads only from Dexie** (`useLiveQuery`) and **writes only through repositories** (`annotationsRepo.create(...)`), which write the row and its outbox entry in a single Dexie transaction.
4. Anything non-portable (file picker, share, storage persistence, haptics, install prompt) goes behind an interface in `src/core/platform/` so a Capacitor implementation can be dropped in.
5. Geometry is stored **normalised (0 to 1), in the page's canonical space, top-left origin**. Conversions live only in `src/core/anchors/geometry.ts`. Never persist pixel coordinates or zoom-dependent values.
6. Strict TypeScript (`strict`, `noUncheckedIndexedAccess`), no `any`; validate data crossing a boundary (Supabase responses, imports, IndexedDB upgrades) with Zod.
7. Domain data MUST NOT live in `localStorage`. (`localStorage` is allowed only for trivial UI preferences such as "sidebar open".)
8. Do not monkey-patch PDF.js internals. Use its public API and `EventBus` events.

### 8.3 Stack

Versions: use the **latest stable at scaffold time**, record exact versions in the lockfile, and pin `pdfjs-dist` to an exact version (verify with `npm view pdfjs-dist version` and read its release notes; the text-layer API is `TextLayer`, the older `renderTextLayer` is deprecated).

| Concern | Choice |
|---|---|
| Build / language | Vite, React, TypeScript (strict), pnpm, current Node LTS. The newest TypeScript major may not yet be supported by every tool (typescript-eslint, Vite plugins, Vitest): at scaffold time confirm compatibility and pin the latest TypeScript version the whole toolchain supports (record in an ADR). |
| Routing | React Router (or TanStack Router); routes: `/login`, `/` (library), `/read/:documentId`, `/settings` |
| UI state | Zustand (ephemeral UI only: selected line, open popover, sidebar) |
| Local DB | Dexie (IndexedDB) + `dexie-react-hooks` |
| Server | Supabase JS v2; Supabase CLI for local dev and migrations; generated types via `supabase gen types` |
| Styling | Tailwind CSS + CSS variables for themes; Radix UI primitives (Popover, Dialog, Tabs, Toast, Slider) for accessibility |
| PDF | `pdfjs-dist` (`PDFViewer`, `EventBus`, `PDFLinkService`, `PDFFindController`) wrapped in a React component |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` |
| Validation | Zod |
| Upload | `tus-js-client` for resumable uploads > 6 MB |
| Hashing | Incremental SHA-256 (e.g. `hash-wasm` or `@noble/hashes`) |
| Export | Plain string builders (Markdown/JSON); `pdf-lib` only in P2 |
| Tests | Vitest, `fast-check`, Playwright (Chromium, WebKit, mobile emulation), axe for a11y, pgTAP or a two-user Supabase JS test for RLS |
| Quality | ESLint, Prettier, `tsc --noEmit`, GitHub Actions CI, Lighthouse CI |
| Hosting | Static host (Vercel, Netlify, or Cloudflare Pages) + hosted Supabase |

### 8.4 Reader rendering stack

- Use `PDFViewer` from `pdfjs-dist/web/pdf_viewer.mjs` inside a React component; do **not** write a custom virtualiser. Import `pdfjs-dist/web/pdf_viewer.css`.
- Each page div gets three of our layers injected on the page's render event (verify event names in the installed version: `pagerendered`, `textlayerrendered`, `scalechanging`, `pagesinit`, `updateviewarea`):
  1. **Hover/selection band** (SVG, below text layer in pointer terms but above canvas visually),
  2. **Annotation overlay** (SVG `rect`s from stored normalised rects, expressed in `%` so zoom needs no recomputation),
  3. **Gutter** (absolutely positioned markers; desktop: a 28 px lane outside the page edge; mobile: inset at the page's right edge).
- Overlays render through React portals keyed by page number. They are never drawn into the canvas, so theme/zoom changes do not touch them.
- PDF.js initialisation (copy `cmaps/` and `standard_fonts/` from `pdfjs-dist` into `public/pdfjs/` at build time and precache them for offline use):

```ts
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function openPdf(source: { data: Uint8Array } | { url: string }) {
  return pdfjsLib.getDocument({
    ...source,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    isEvalSupported: false,
    enableXfa: false,
  });
}
```

- Pinch zoom is not handled by the `PDFViewer` class: implement it in `features/reader/gestures/` (CSS `transform: scale()` on the scroller during the gesture, commit to `currentScale` on release, honour NFR-PERF-04). This is risk R2; it is validated in spike S3 on real devices.

### 8.5 Line Engine (`src/core/line-engine`) — the crown jewel

**Input**: PDF.js `TextContent.items` for a page + the canonical viewport (`page.getViewport({ scale: 1 })`, i.e. the page's intrinsic rotation, scale 1). User view-rotation is applied afterwards by the overlay, never inside the engine.

```ts
export interface NRect { x: number; y: number; w: number; h: number } // 0..1, canonical page space, top-left origin

export interface RawTextItem {
  str: string;
  rect: NRect;        // already normalised by the adapter
  baseline: number;   // normalised y of the baseline (ADR 0001)
  fontSize: number;   // in canonical page units (e.g. 1/72 in), for gap thresholds
  vertical: boolean;  // true if not horizontal text
  hasEOL: boolean;
}

export interface Line {
  page: number;       // 1-based
  index: number;      // reading order within page (volatile: depends on engineVersion)
  region: number;     // XY-cut leaf / column id
  text: string;
  rect: NRect;        // union of item rects
  band: NRect;        // highlight geometry (step 7), precomputed because it needs neighbours (ADR 0001)
  pitch: number;      // distance to next baseline in the same region (normalised); used for hit tolerance
  items: { itemIndex: number; charStart: number; charEnd: number; rect: NRect }[];
  hyphenated: boolean; // ends with a soft line-break hyphen
}

export interface PageLines {
  engineVersion: number;
  page: number;
  lines: Line[];
  text: string;       // lines joined with '\n'
  textNorm: string;   // NFKC, collapsed whitespace, de-hyphenated, for quote matching
  hasTextLayer: boolean;
}

// size = canonical page width/height in page units (thresholds are in ems, rects are normalised; ADR 0001)
export function buildPageLines(page: number, items: RawTextItem[], size: { width: number; height: number }, cfg?: Partial<LineEngineConfig>): PageLines;
export function hitTest(pl: PageLines, nx: number, ny: number): Line | null; // snaps within pitch/2
export function neighborLine(pl: PageLines, line: Line, dir: 1 | -1): Line | null;
```

**Algorithm** (values in `LINE_ENGINE_CONFIG`, tuned in S1 — see `docs/adr/0001-line-engine.md`):

1. Drop empty/whitespace-only items for geometry (keep for offset bookkeeping). Items with non-horizontal direction become single-item lines.
2. **Regions**: recursive **XY-cut** over item rects. At each node, first try a **column** cut along vertical gaps ≥ `xCutGap` × median font size (1.0), valid only when the node spans ≥ 2 text rows and yields ≥ 2 *wide* segments (≥ `minColWidth` = 4 em); narrow segments (bullets, line numbers, table cells) join their nearest wide neighbour, so tables read as rows. Otherwise cut once at the **widest** horizontal gap ≥ `yCutGap` × median font size (1.0) and recurse. Leaves are columns/blocks; order = left-to-right for column cuts, top-to-bottom for band cuts. Column-first prevents a band cut through aligned paragraph gaps from interleaving two columns. This handles two-column papers, sidebars and full-width titles.
3. **Lines inside a leaf**: sort by baseline y, then x. An item joins the current line if `|baseline − lineBaseline| ≤ baselineTol × lineFontSize` **or** vertical overlap ratio ≥ 0.5 (superscripts, subscripts, inline math).
4. **Text join**: items sorted by x; insert a space when the gap > `wordGap` × font size (default 0.15), else concatenate.
5. **Hyphenation**: if a line ends in `-` and the next line in the region starts with a lowercase letter, set `hyphenated = true`; `textNorm` removes the hyphen and newline.
6. **Rect, pitch**: line rect = union of item rects; `pitch` = baseline distance to the next line in the region (fallback: 1.2 × font size).
7. **Highlight geometry** `line.band`: height = 1.15 × font size centred on the text body, clamped to the midpoint between neighbouring baselines so adjacent highlights never overlap and show no visible gap.
8. **Scanned pages**: if there are no non-empty items, return `hasTextLayer: false` (FR-LIN-06).
9. `hitTest` is `O(log n)` (binary search by y within regions, then x), tolerant within `pitch / 2`.

**Caching**: in-memory LRU of 50 pages + Dexie `lineCache` keyed `[docHash+page+engineVersion]`. Bump `ENGINE_VERSION` whenever segmentation output changes. Because stored annotations carry their own rects (§8.6), an engine change never breaks existing annotations; it only changes which lines are offered for *new* selections.

**Fallback if S1 fails**: derive lines from DOM rect clustering of the PDF.js text-layer spans (`getClientRects`) and accept lower accuracy on multi-column pages. Decide via ADR at the M0 gate.

### 8.6 Anchors (`src/core/anchors`)

```ts
export interface Anchor {
  v: 1;                         // anchor schema version
  page: number;                 // 1-based
  rects: NRect[];               // one per visual line fragment, reading order; THE source of truth for drawing
  quote: { exact: string; prefix: string; suffix: string }; // NFC; exact ≤ 400 chars, prefix/suffix ≤ 32
  hint?: { start: number; end: number; engine: number };   // offsets into PageLines.textNorm; volatile, optional
}
```

Rules:

- **Rendering and jumping never call the Line Engine**: draw `rects`; jump to `page` + `rects[0].y`. Hence annotations are immune to engine changes and PDF.js upgrades.
- The **quote** (W3C Web Annotation `TextQuoteSelector` style) exists for display, search, export, and P2 "relink to a new file revision" (fuzzy match within ±3 pages at ≤ 15 % edit distance).
- From a whole line: `anchorFromLine(line)`. From a DOM selection: `anchorFromRange(range, pageEl, pageLines)` builds one rect per client rect group, normalised against the page element's box, then un-rotated into canonical space.
- Gutter marker y = `rects[0].y + rects[0].h / 2`.
- `geometry.ts` exposes `toCanonical(rect, userRotation)` and `fromCanonical(rect, userRotation)`; property-tested (§12) so `from(to(r)) ≈ r` for every rotation and aspect ratio.

### 8.7 Theme engine (`features/theme`)

**Decided in S2 (`docs/adr/0002-theme-strategy.md`): one strategy, `cssFilter`, for every document.** In the pinned PDF.js (6.3.289) `pageColors` is a whole-canvas luminance filter that posterizes images and coloured content to a 6-step ramp and has no runtime setter (switching rebuilds the viewer), so it is not used.

```ts
export type ThemeId = 'system' | 'light' | 'warm' | 'dark' | 'night-warm';

export interface ThemeTokens {
  pageBg: string; pageFg: string;     // targets of the page filter: white -> pageBg, black -> pageFg
  uiBg: string; uiFg: string; uiMuted: string; accent: string;
  highlight: Record<1|2|3|4|5|6|7|8, string>;  // per-theme tuned colours
  highlightBlend: 'multiply' | 'normal';
  highlightAlpha: number;
}
```

- **`cssFilter`** on each page's `.canvasWrapper` (composite-time only; canvas pixels untouched, no re-render): warm = inline SVG `feComponentTransfer` linear map black → `pageFg`, white → `pageBg`; dark = `hue-rotate(180deg)` + the same kind of map with negative slope (luminance inverted, hue kept). Exact token colours; instant.
- **Images in dark themes**: with "Invert images" OFF (default for text PDFs) image rects (PDF.js `imagesRightClickMinSize` → `pdfPage.imageCoordinates`) are restored from the unfiltered canvas pixels into overlay canvases above the canvas; pages > 80 % covered by images count as scanned and stay inverted (default ON for scanned). Pages that are already dark (mean luminance < 0.35) skip the dark filter.
- **Warmth overlay**: a full-viewport `div` with `mix-blend-mode: multiply`, `pointer-events: none`, colour derived from the 0 to 100 % slider, applied over the reader (not the chrome's popovers).
- App chrome themes via CSS variables on `:root[data-theme]`.

Starting token values (tune in S2; validate contrast with a script in CI):

| Token | Light | Warm | Dark |
|---|---|---|---|
| pageBg | `#FFFFFF` | `#F4ECD8` | `#121212` |
| pageFg | `#1A1A1A` | `#3B2F2F` | `#E6E1D6` |
| uiBg | `#FAFAF9` | `#EFE6CF` | `#1B1B1B` |
| highlightBlend | multiply | multiply | normal (α ≈ 0.38) |

Default palette (light-theme starting hex): Yellow `#FFE066`, Green `#8FD694`, Blue `#7CC4F4`, Pink `#F59BB4`, Purple `#C3A6F2`; each theme overrides lightness/alpha to hold FR-THM-05.

### 8.8 Sync engine (`src/core/sync`)

Tables mirrored: `documents`, `annotations`, `reading_positions`, `profiles.settings`. Blobs (PDFs, covers) are handled by a separate transfer queue.

```ts
export type OutboxOp = 'upsert' | 'delete';
export interface OutboxItem {
  seq?: number;            // auto-increment, defines order
  entity: 'document' | 'annotation' | 'position' | 'settings';
  entityId: string;
  op: OutboxOp;
  payload: unknown;        // full row snapshot (Zod-validated)
  attempts: number;
  status: 'pending' | 'failed'; // failed = permanent error, shown on the Sync issues screen
  lastError?: string;
  createdAt: number;
}
```

Outbox entries coalesce at **write time**: a repository write replaces older entries for the same `(entity, entityId)` in the same transaction (payloads are full snapshots, so this is lossless; ADR 0007).

**Push**: take outbox items ordered by `seq`; coalesce multiple upserts of the same `(entity, entityId)` to the newest; batch ≤ 100; `upsert ... on conflict (id)`; on success delete the outbox row; on retryable error back off 1 s → 60 s with jitter; on a permanent error (4xx other than 401/409/429) move the item to `failed` and surface it (FR-SYN-10). `401` ⇒ refresh the session or ask to log in again; the outbox is retained.

**Server timestamps**: `updated_at` is set by a database trigger (clients cannot forge it). Deleting = `update ... set deleted_at = now()` (tombstone). Hard deletes only via an admin job after 90 days.

**Pull**: per table, `where (updated_at, id) > (cursor_ts − 5 s, cursor_id) order by updated_at, id limit 500`, looping until exhausted. The 5 s overlap protects against transactions committing out of timestamp order; applying a row is idempotent. A pulled row is **skipped if a pending outbox entry exists for that entity** (the local edit will win when pushed). Otherwise apply if `incoming.updated_at >= local.updated_at`.

**Duplicate-document merge (FR-SYN-09)**: on a unique-violation for `(user_id, content_hash)`, fetch the existing document, remap all local `documentId` references (annotations, positions, outbox, file cache) in one transaction, drop the losing local document row, and retry.

**Realtime (P1)**: subscribe to `annotations` and `reading_positions` filtered by `user_id`; feed events through the same apply path as pull.

**Blob transfer**: upload with TUS (resumable, > 6 MB) to bucket `pdfs`, object name `{user_id}/{content_hash}.pdf` (the first path segment must equal the user id for the storage policy to pass); download via signed URL + `fetch` stream to report progress; store as Blob in Dexie `files` with `lastAccessAt` for LRU. Never trust a downloaded blob: recompute SHA-256 and compare to `content_hash`.

**iOS caveat**: no Background Sync; flush on `visibilitychange`, `online`, and a foreground timer only.

### 8.9 PWA and platform

- Manifest: `name`, `short_name`, `id`, `start_url`, `display: "standalone"`, `theme_color` / `background_color`, icons 192/512 including maskable.
- Service worker: precache the app shell and PDF.js assets; `CacheFirst` runtime cache for `/pdfjs/*`; **never** cache Supabase API responses (Dexie is the offline store). Use `registerType: 'prompt'` and show "New version available. Reload" so an update never reloads mid-read.
- Layout: `100dvh`, safe-area insets, `overscroll-behavior: contain` on the reader scroller, `touch-action` tuned so tap/pinch/scroll do not fight.
- P2: Web Share Target (Android: share a PDF *into* the app), File Handling API (desktop Chromium "Open with"), Capacitor wrapper.
- Known iOS quirk to evaluate in S4: the native text-selection callout can overlap our toolbar; position our toolbar to avoid the callout rather than trying to suppress it.

### 8.10 Repository layout

```
/
├─ CLAUDE.md                     # operating rules for Claude Code (short)
├─ docs/
│  ├─ PRD.md                     # this file
│  ├─ adr/                       # one short file per architecture decision
│  └─ benchmarks.md              # NFR-PERF-06 results
├─ src/
│  ├─ app/                       # providers, router, shell, error boundaries
│  ├─ features/
│  │  ├─ library/  reader/  annotations/  theme/  search/  settings/  auth/
│  ├─ core/
│  │  ├─ line-engine/            # pure TS (rule 1)
│  │  ├─ anchors/                # pure TS (rule 1, 5)
│  │  ├─ db/                     # Dexie schema, repositories, upgrades
│  │  ├─ sync/                   # outbox, push, pull, blobs, realtime
│  │  ├─ auth/  supabase/
│  │  └─ platform/               # adapters (rule 4)
│  ├─ shared/{ui,i18n,hooks,utils}/
│  └─ config.ts                  # constants (below)
├─ supabase/{migrations,seed.sql,tests}/
├─ e2e/                          # Playwright specs
├─ fixtures/pdfs/                # corpus (Appendix B); public-domain/CC or generated only
└─ spikes/                       # throwaway M0 code; deleted after the gate
```

`src/config.ts` constants:

```ts
export const APP_NAME = 'Marginalia';
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_CLOUD_FILE_BYTES = 50 * 1024 * 1024; // verify the Supabase plan limit in S5
export const OFFLINE_CACHE_BYTES = 500 * 1024 * 1024;
export const OFFLINE_CACHE_DOCS = 5;
export const NOTE_AUTOSAVE_MS = 500;
export const RESUME_SAVE_DEBOUNCE_MS = 1000;
export const PULL_OVERLAP_MS = 5000;
export const PUSH_BATCH_SIZE = 100;
export const MAX_CANVAS_PIXELS = 16_777_216;
export const PALETTE_MAX = 8;
```

---

## 9. Data model

### 9.1 Postgres (Supabase) — `supabase/migrations/0001_init.sql`

Design notes: client-generated UUIDs (idempotent offline creates); `updated_at` is **server-assigned by trigger** (clients cannot forge it); soft deletes via `deleted_at`; every row carries `user_id` and is protected by RLS; `page` duplicates `anchor.page` for indexing and is checked for consistency. Child rows reference their document through a composite `(document_id, user_id)` foreign key, so a user can never attach rows to another user's document (RLS alone does not cover FK targets; ADR 0005).

```sql
create type public.annotation_kind as enum ('highlight', 'note', 'bookmark');
create type public.doc_storage_mode as enum ('cloud', 'device');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  settings jsonb not null default '{}'::jsonb,   -- palette, theme, warmth, gutter style, keymap
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(title) between 1 and 500),
  author text,
  page_count integer not null check (page_count > 0),
  file_size bigint not null check (file_size > 0),
  storage_mode public.doc_storage_mode not null default 'cloud',
  storage_path text,                              -- object name in bucket 'pdfs': {user_id}/{content_hash}.pdf (cloud mode only)
  cover_path text,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index documents_user_hash_live
  on public.documents (user_id, content_hash) where deleted_at is null;
-- target of the composite FKs below: a child row's owner must equal its document's owner (S5, ADR 0005)
alter table public.documents add constraint documents_id_user_key unique (id, user_id);
create index documents_sync_idx on public.documents (user_id, updated_at, id);

create table public.annotations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  kind public.annotation_kind not null,
  page integer not null check (page > 0),
  anchor jsonb not null,                          -- Anchor v1 (see 8.6), Zod-validated on the client
  color_id smallint check (color_id between 1 and 8),
  body text check (char_length(body) <= 20000),   -- note text (Markdown source)
  label text check (char_length(label) <= 200),   -- bookmark label
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint annotations_page_matches_anchor check ((anchor ->> 'page')::integer = page),
  constraint annotations_highlight_needs_color check (kind <> 'highlight' or color_id is not null),
  constraint annotations_note_needs_body check (kind <> 'note' or body is not null),
  constraint annotations_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index annotations_doc_page_idx
  on public.annotations (user_id, document_id, page) where deleted_at is null;
create index annotations_sync_idx on public.annotations (user_id, updated_at, id);

create table public.reading_positions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  page integer not null check (page > 0),
  anchor jsonb,                                   -- reading-line anchor (nullable for page-level resume)
  progress real not null check (progress >= 0 and progress <= 1),
  device_id text not null,
  device_label text,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id),
  constraint reading_positions_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index reading_positions_sync_idx on public.reading_positions (user_id, updated_at);

-- Server-assigned timestamps
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger trg_profiles_updated before insert or update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_documents_updated before insert or update on public.documents
  for each row execute function public.set_updated_at();
create trigger trg_annotations_updated before insert or update on public.annotations
  for each row execute function public.set_updated_at();
create trigger trg_positions_updated before insert or update on public.reading_positions
  for each row execute function public.set_updated_at();

-- Auto-create a profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.annotations enable row level security;
alter table public.reading_positions enable row level security;

create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy documents_owner on public.documents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy annotations_owner on public.annotations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy positions_owner on public.reading_positions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Storage: private bucket, one folder per user. The per-object size cap is set to the
-- plan limit (verify in S5; free plans may cap lower than this).
insert into storage.buckets (id, name, public, file_size_limit)
values ('pdfs', 'pdfs', false, 52428800)
on conflict (id) do nothing;

create policy pdfs_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

Semantics worth stating explicitly:

- A line that is highlighted **and** noted **and** bookmarked is three independent rows sharing (nearly) the same `anchor.rects`. The UI groups rows by line for display and the toolbar's state; deletion of one never affects the others.
- `reading_positions` is one row per document (last-write-wins across devices). `device_id` is a random UUID persisted per browser profile; `device_label` is a human-readable name ("Chrome on Windows", "iPhone").
- Hard deletes are never issued by clients. Tombstones older than 90 days may be purged by a scheduled job (P2).

### 9.2 Local database (Dexie / IndexedDB) — `src/core/db/schema.ts`

```ts
import Dexie, { type Table } from 'dexie';

export class AppDB extends Dexie {
  documents!: Table<DocumentRow, string>;
  annotations!: Table<AnnotationRow, string>;
  positions!: Table<PositionRow, string>;       // key: documentId
  files!: Table<FileCacheRow, string>;          // key: documentId; { blob, lastAccessAt, pinned }
  covers!: Table<CoverRow, string>;             // key: documentId
  outbox!: Table<OutboxItem, number>;
  meta!: Table<{ key: string; value: unknown }, string>; // sync cursors, deviceId, flags
  lineCache!: Table<LineCacheRow, [string, number, number]>;

  constructor() {
    super('marginalia');
    this.version(1).stores({
      documents: 'id, contentHash, lastOpenedAt, updatedAt, deletedAt',
      annotations: 'id, documentId, [documentId+page], [documentId+kind], updatedAt, deletedAt',
      positions: 'documentId, updatedAt',
      files: 'documentId, lastAccessAt',
      covers: 'documentId',
      outbox: '++seq, [entity+entityId], status',   // status: 'pending' | 'failed' (FR-SYN-10)
      meta: 'key',
      lineCache: '[docHash+page+engine]',
    });
  }
}
```

Rows mirror the SQL columns (camelCase) **without `user_id`** (the server fills it from the JWT; the local DB records its owner) plus local-only `localUpdatedAt`; sync state is derived from the outbox (ADR 0007). Every Dexie schema change adds a new `version(n)` with an `upgrade()` function and a test.

---

## 10. UX specification

### 10.1 Principles

1. **Reading first**: chrome auto-hides; no modal dialogs for annotation; popovers anchor to the line.
2. **Cheapest path wins**: any annotation action reachable in ≤ 3 inputs (§2.2).
3. **Undo over confirm**: destructive actions apply immediately with an Undo toast, except deleting existing note text.
4. **Same model everywhere**: desktop and phone expose the same actions; only input differs.

### 10.2 Desktop reader layout

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [=] [Library]  Deep Learning.pdf   [<] [ 20 ] / 800 [>]   [-] 100% [+]  [Find] [Theme] [Synced] │
├───────────────┬───────────────────────────────────────────────────────────┬───────────────┤
│ Sidebar tabs  │                                                           │               │
│ [Pages][TOC]  │   The gradient of the loss with respect to the weights    │ (gutter)      │
│ [Marks][Notes]│   is computed by backpropagation, which applies the       │  [bookmark]   │
│               │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (selected line)    │
│  list of      │   chain rule layer by layer. Notice that every term…      │  [note]       │
│  items…       │                                                           │               │
└───────────────┴───────────────────────────────────────────────────────────┴───────────────┘
        floating line toolbar (above the selected line):
        ┌──────────────────────────────────────────────────────┐
        │ (1) (2) (3) (4) (5)  |  Note  Bookmark  Copy     [x] │   (1..5 = palette swatches)
        └──────────────────────────────────────────────────────┘
```

- The gutter lane holds marker icons: **ribbon** = bookmark, **speech bubble** (or dot) = note (tinted by highlight colour). Multiple items on one line stack horizontally.
- Clicking a marker opens an anchored popover: quoted line (2-line clamp) + editable note + Delete.
- The sidebar lists items per tab; clicking an item jumps and flashes the line for 1.2 s.

### 10.3 Mobile reader layout

```
┌───────────────────────────┐
│ [<]  Deep Learning  [Find]│  <- top bar, auto-hides on scroll; tap blank area to toggle
├───────────────────────────┤
│  The gradient of the loss │
│  with respect to the     [b]  <- gutter marker inset at the right edge (44 px hit area)
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  <- selected line
│  chain rule layer by      │
│  layer. Notice that…      │
├───────────────────────────┤
│ 20/800 ──●──── [Mark][Aa] │  <- bottom bar: scrubber, quick-bookmark, theme/panel
└───────────────────────────┘
 line toolbar: floating pill above the selected line:  (1)(2)(3)(4)(5) | Note | Mark
 panel (bookmarks/highlights/notes): bottom sheet with tabs, drag to expand
```

### 10.4 Interaction states

| State | Visual |
|---|---|
| Hover (desktop) | Faint band on the line after 120 ms |
| Selected line | Solid band + toolbar; `aria-selected` on the logical line |
| Highlight | Colour wash per theme tokens; same wash plus a 2 px left rule when it has a note |
| Resume marker | Left-edge triangle for 2 s after opening |
| Jump target | Pulse for 1.2 s |
| Search hit | Distinct from highlights (outline, not fill) |
| Offline / syncing | Header pill: `Synced`, `Syncing…`, `Offline · 3 pending`, `Sync error · Retry` |

### 10.5 First-run and empty states

- First run: sign-in → empty library with a large "Add a PDF" drop zone and a 3-step coach mark (tap a line / press `H` / press `N`).
- iOS Safari (not installed): banner explaining "Share → Add to Home Screen" and why (storage durability).
- Pages without text: banner per FR-LIN-06. Offline without cache: explain and offer retry.

---

## 11. Delivery plan

Order is deliberate: **de-risk the line, then build around it.** Each milestone ends with an exit gate; do not start the next milestone until the gate passes. Each task should fit in one focused Claude Code session and one PR.

### M0 — De-risk spikes (throwaway code in `spikes/`; findings in `docs/adr/`)

| ID | Spike | Exit criteria (all must hold) |
|---|---|---|
| S1 | **Line Engine** on the Appendix B corpus. | Ground truth = synthetic fixtures with line boundaries known by construction (generated via ReportLab/pdf-lib/LaTeX) + 20 hand-verified real pages (render PNG overlays of predicted lines for human review). Line-boundary F1 (a predicted line matches if normalised text equal and IoU ≥ 0.5): **≥ 0.97 single-column, ≥ 0.92 two-column**. Median < 30 ms per 3,000-char page on desktop (NFR-PERF-07). Scanned page ⇒ `hasTextLayer: false`. Non-Latin PDFs do not throw. |
| S2 | **Theme strategies** (`pageColors` vs `cssFilter`) on ≥ 6 PDFs: text-only, image-heavy, diagram-heavy, coloured slides, scanned, mixed. | Written comparison with screenshots. Text contrast ≥ 4.5:1 in Dark and Warm. Images not inverted under `pageColors`. Visible-page switch < 300 ms on a 1,500 × 2,000 px page. Documents exactly how PDF.js receives `pageColors` in the pinned version and whether runtime switching needs a re-render. |
| S3 | **PDFViewer + overlay + pinch zoom** on real Android Chrome and real iOS Safari. | Overlay rect drift ≤ 1 CSS px at 50 to 400 % zoom and rotations 0/90/180/270; no canvas above 16.7 M px; pinch stays ≥ 45 fps on the 500-page fixture; no scroll/pinch/tap conflicts. |
| S4 | **Tap-vs-drag and selection → anchor** on touch and mouse. | ≥ 95 % correct classification over 50 trials per device; native selection never blocked; selection spanning 3 lines yields 3 rects within 1 px of the text layer; iOS callout vs toolbar placement decided. |
| S5 | **Supabase local + hosted**: migrations, RLS two-user test, storage policy, resumable upload, actual plan limits. | `supabase db reset` runs `0001_init.sql` cleanly; the RLS test proves isolation for all tables and the bucket; plan limits (max object size, storage, egress, pausing) recorded in ADR; `MAX_CLOUD_FILE_BYTES` set from facts. |

**Go / no-go gate**: if S1 misses F1 by > 0.05, adopt the fallback in §8.5 (DOM-rect clustering) and re-run S1; if S3 shows pinch/virtualisation cannot hit the budgets on iOS, drop pinch to stepped zoom (buttons + double-tap) for v1 and record it. Do not proceed to M1 without an ADR for each spike.

### M1 — Foundation and reader MVP (no annotations yet; accounts + schema exist)

| ID | Task | Covers | Depends |
|---|---|---|---|
| T-100 | Scaffold Vite + React + TS (strict), ESLint/Prettier, Vitest, Playwright, CI, `config.ts`, ADR template, copy `CLAUDE.md` + `docs/PRD.md` | NFR-SEC-07 | S* |
| T-101 | Design tokens, chrome theme provider (Light/Warm/Dark), Radix wrappers, i18n scaffold, app shell, error boundary | FR-THM-01 (chrome) | T-100 |
| T-102 | Supabase: `0001_init.sql`, seed, generated types, local-dev docs, RLS two-user test in CI | NFR-SEC-01 | T-100 |
| T-103 | Auth (magic link + Google), session handling, route guards, sign-out with "remove local data" | FR-SYN-01 | T-102 |
| T-104 | Dexie schema, repositories, Zod models, upgrade scaffold, outbox write path (no network) | FR-SYN-02 | T-100 |
| T-105 | Add-PDF pipeline: validation, streaming SHA-256, metadata, thumbnail, local Blob, document row, dedupe | FR-LIB-01..03 | T-104 |
| T-106 | Library screen (virtualised grid/list, sort, search, empty state) | FR-LIB-04 | T-105 |
| T-107 | Reader shell: PDF.js init, `PDFViewer` wrapper, scroll, page nav, zoom, password + error states | FR-RDR-01..03, 12 | T-105 |
| T-108 | Sidebar: thumbnails, outline; in-doc search | FR-RDR-04..06 | T-107 |
| T-109 | Selection/copy, links with history, rotate | FR-RDR-07..09 | T-107 |
| T-110 | Page-level resume (save/restore, debounce, `pagehide`) | FR-BKM-04 (partial) | T-107 |
| T-111 | PWA manifest, service worker, update prompt, PDF.js assets precache; installable on Android | §8.9 | T-107 |
| T-112 | Mobile layout, auto-hiding bars, pinch zoom, canvas caps (from S3) | FR-RDR-03, NFR-PERF-04 | T-107 |

**M1 exit**: a signed-in user adds a 300-page PDF, reads it on desktop and Android (installed PWA), reopens at the same page, search/outline/thumbnails work; Lighthouse PWA checks pass; RLS test green; NFR-PERF-01/02 measured and recorded.

### M2 — Annotation core (local-first; the heart of the product)

| ID | Task | Covers | Depends |
|---|---|---|---|
| T-200 | Productionise Line Engine from S1 in `core/line-engine` (goldens, cache, config, `ENGINE_VERSION`) | FR-LIN-01/06/07, NFR-PERF-07 | S1, M1 |
| T-201 | Anchors + geometry + property tests (rotation, aspect, round-trip) | §8.6 | T-200 |
| T-202 | Overlay manager, gutter lane, hover band, `%` coordinates, portals per page | §8.4 | T-107 |
| T-203 | Line selection, toolbar, tap-vs-drag, line-cursor navigation, selection → anchor | FR-LIN-01..04 | T-201, T-202, S4 |
| T-204 | Highlights: default palette, apply/replace/remove, rendering tokens, undo/redo stack | FR-HLT-01..04, FR-KEY-06 | T-203 |
| T-205 | Bookmarks: quick key/button, gutter ribbon, list, `[` `]` | FR-BKM-01..03 | T-203 |
| T-206 | Line-level resume (reading-line anchor), resume marker | FR-BKM-04 | T-203 |
| T-207 | Notes: popover editor, autosave, gutter indicator, hover preview, empty-note rules | FR-NOT-01..04 | T-203 |
| T-208 | Annotation panel: tabs, grouping, colour chips, text filter, jump + flash | FR-PNL-01 | T-204..207 |
| T-209 | Theme engine: strategies from S2, warmth slider, per-theme highlight tokens, contrast script in CI | FR-THM-01..07 | S2 |
| T-210 | Keymap router (input/IME guard), cheat sheet, mobile gesture map | FR-KEY-01..03, 05 | T-203 |
| T-211 | P1 batch: multi-line extend, change colour, colour filters, Markdown notes, region highlight (scanned) | FR-LIN-05/08, FR-HLT-05/06, FR-NOT-05/06 | T-208 |

**M2 exit**: all P0 `FR-LIN`, `FR-HLT`, `FR-BKM-01..04`, `FR-NOT`, `FR-THM`, `FR-PNL-01`, `FR-KEY` pass in Playwright (desktop Chromium, WebKit, Pixel/iPhone emulation) and a manual checklist on one real Android + one real iPhone; NFR-PERF-03 verified (< 100 ms).

### M3 — Cloud: sync, files, offline

| ID | Task | Covers | Depends |
|---|---|---|---|
| T-300 | Sync engine: push/pull, coalescing, backoff, LWW, status UI, unit tests | FR-SYN-02..05, 08 | M2 |
| T-301 | Duplicate-document merge | FR-SYN-09 | T-300 |
| T-302 | Blob upload (TUS), download w/ progress, IndexedDB cache + LRU, hash verification, storage modes, attach flow, quota meter | FR-LIB-05/06/08, FR-SYN-07 | T-300, S5 |
| T-303 | Cross-device resume prompt + device labels | FR-BKM-05 | T-300 |
| T-304 | Realtime subscriptions (P1) | FR-SYN-06 | T-300 |
| T-305 | "Sync issues" screen; chaos tests (kill tab mid-edit, flaky/offline network via Playwright routing, clock skew) | FR-SYN-10, NFR-REL-01 | T-300 |
| T-306 | Settings sync (palette, theme, warmth, gutter style) | FR-THM-06, FR-SET-01 | T-300 |

**M3 exit**: Chrome desktop and an Android phone converge within 5 s online; 100 offline edits on each side merge correctly after reconnect; the kill-tab test loses nothing; the duplicate-add test passes.

### M4 — Hardening and v1.0

| ID | Task | Covers |
|---|---|---|
| T-400 | Export: Markdown + JSON, including the export entry point in the annotation panel | FR-EXP-01/02, FR-PNL-03 |
| T-401 | Settings screens: palette editor with contrast check, shortcut remap, cache budget | FR-SET-*, FR-KEY-04, FR-BKM-06 |
| T-402 | Accessibility audit (axe + manual keyboard + screen reader pass) and fixes | NFR-A11Y-* |
| T-403 | Performance pass against all NFR-PERF budgets; Lighthouse CI | NFR-PERF-* |
| T-404 | Security review: RLS suite, CSP enforced in CI, dependency audit, log scrubbing | NFR-SEC-* |
| T-405 | Onboarding, iOS install helper, empty/error copy | §10.5 |
| T-406 | Benchmark vs Acrobat and one competitor; publish `docs/benchmarks.md` | NFR-PERF-06 |
| T-407 | Release: README, privacy note, production Supabase + hosting, tag v1.0 | |
| T-408 | P1 reader/library extras: rename and delete document (both delete modes, tombstoned), single-page and two-page-spread modes, distraction-free mode | FR-LIB-07, FR-RDR-10, FR-RDR-11 |
| T-409 | Library-wide annotation search (client-side over IndexedDB) | FR-PNL-02 |

**v1.0 exit**: every P0 and P1 requirement passes; NFR budgets met or waived by ADR; benchmark ≥ 2x faster median than the baseline (else revisit H1 before adding features).

### Post-v1 backlog (P2, in rough order)

Region/OCR for scanned PDFs (Tesseract.js, lazy WASM, per-page, stored text layer) → column-snap smart zoom for phones → Web Share Target + File Handling → annotated-PDF export → note revisions + tags → relink annotations to a new file revision → Capacitor wrapper → EPUB engine → account deletion/export tooling.

---

## 12. Testing strategy

| Layer | Tooling | What must be covered |
|---|---|---|
| Line Engine | Vitest goldens | JSON snapshots per fixture page; F1 report script (S1 metrics become a CI regression gate); no-throw suite for non-Latin/rotated/empty pages |
| Geometry / anchors | Vitest + `fast-check` | `fromCanonical(toCanonical(r, rot), rot) ≈ r` for all rotations/aspect ratios; anchor from selection stays within 1 px of text-layer rects |
| Key router | Vitest | No-fire inside inputs/IME; remap conflicts; modifier-only rejection |
| Repositories / sync | Vitest with `fake-indexeddb` + mocked Supabase | Outbox atomicity; coalescing; LWW (concurrent edit, edit-vs-delete, offline-both); pull-skip-if-pending; duplicate-document merge |
| Database | pgTAP or a two-user Supabase JS test | RLS isolation on all tables and the `pdfs` bucket; constraints (`page` matches anchor, highlight needs colour); trigger sets `updated_at` |
| E2E | Playwright: Chromium, WebKit, Pixel 7 and iPhone 14 emulation | The user stories US-01..10; timing tests for §2.2; kill-tab-mid-edit; offline then reconnect; two browser contexts for sync and duplicate-add |
| Accessibility | axe-playwright + manual | NFR-A11Y-01/02; focus order in popovers |
| Visual | Playwright screenshots | Theme × fixture matrix; highlight contrast script |
| Performance | Lighthouse CI + custom marks | NFR-PERF budgets on the 500-page fixture |
| Manual device matrix | Checklist in `docs/qa-checklist.md` | Real Android + real iPhone each milestone: pinch, selection, install, offline, storage persistence |

Playwright's WebKit is **not** iOS Safari; real-device passes are mandatory at M0 (S3, S4), M2 exit, and M4.

---

## 13. Risks and mitigations

| ID | Risk | Likelihood / impact | Mitigation | Early signal |
|---|---|---|---|---|
| R1 | Line segmentation is wrong on real-world layouts (columns, footnotes, math, tables) | High / **Critical** | M0 gate with numeric F1; XY-cut; geometry-first anchors so errors only affect *new* selections; DOM-rect-clustering fallback; hand-verified overlays | S1 F1 below target |
| R2 | Mobile PDF UX: pinch + virtualisation + selection conflicts; iOS canvas/memory ceilings | High / High | Canvas pixel and DPR caps; S3/S4 on real devices; stepped-zoom fallback | S3 fps below 45 or tab reloads on iOS |
| R3 | Dark/warm fidelity (images, scanned pages) | Medium / Medium | Two strategies, scanned detection, "Invert images" toggle | S2 screenshots |
| R4 | Supabase free-tier ceilings (≈ 1 GB storage ≈ 20 × 50 MB books, ≈ 5 GB egress ≈ 100 re-downloads, ~7-day inactivity pause, object-size cap) | High / Medium | `device` storage mode, local Blob cache with hash verification, quota meter, budget Pro if daily-driven | Storage meter > 70 % or project paused |
| R5 | Sync bugs (LWW surprises, clock/commit ordering, duplicate docs) | Medium / High | Server-assigned timestamps, 5 s pull overlap, pull-skip-if-pending, chaos tests, "Sync issues" screen | Divergent state in M3 two-device test |
| R6 | iOS PWA storage eviction and no Background Sync | Medium / Medium | Cloud as source of truth, `storage.persist()`, install helper, flush on foreground | Missing local data after a week idle |
| R7 | Scope creep (reflow, OCR, EPUB, AI) | High / High | P0/P1/P2 discipline; nothing P2 before M4 exit; ADR to promote any item | PRs referencing no requirement ID |
| R8 | Weak differentiation vs Xodo / PDF Expert / Zotero / Readwise Reader | Medium / High | H1 benchmark (NFR-PERF-06); competitor teardown before polish | Benchmark < 2x |
| R9 | PDF.js upgrade churn and security (API changes; malicious PDFs) | Medium / High | Exact pin, deliberate upgrades with goldens + E2E, `isEvalSupported: false`, track advisories | Dependabot/audit alerts |
| R10 | Copyright/ToS if opened to the public (user-uploaded books in cloud storage) | Low now / High later | Private-only storage, no sharing features, ToS + takedown process before any public launch | Any request to share |
| R11 | AI-assisted development failure modes (context bloat, silent scope drift, untested core) | Medium / Medium | Short `CLAUDE.md`, one task per session, tests mandatory for `core/*`, PRD IDs in every PR | Large PRs touching many layers |

---

## 14. Open questions (resolve by ADR; none block M0)

1. Final product name and domain.
2. Hindi / Indic-script PDFs: how important is line-level support in v1 (affects S1 corpus and fonts)?
3. Hosting plan: stay on Supabase free tier for personal use, or pay for Pro from day one (affects H6/R4)?
4. Realtime (P1) vs pull-on-focus only: is ≤ 5 s propagation worth the extra moving part?
5. Open-source licence and repository visibility.
6. Should note text support images/attachments later (storage implications)?

---

## Appendix A — Default shortcuts and gestures

**Desktop (single keys apply only when no text field is focused and no IME composition is active)**

| Key | Action |
|---|---|
| Click / tap a line | Select line, show toolbar |
| `↑` `↓` or `K` `J` | Move line cursor (only when a line is selected; otherwise arrows scroll) |
| `Shift+↑` `Shift+↓` | Extend selection by line (P1) |
| `H` | Highlight selected line with the active colour |
| `1`–`8` | With a line selected: apply colour N. With none: set the active colour |
| `B` | Quick bookmark (selected line, else reading line); again to remove |
| `N` | Add/edit note on the selected line |
| `Delete` / `Backspace` | Remove highlight/bookmark on the selected line (Undo toast) |
| `Esc` | Clear selection / close popover |
| `[` `]` | Previous / next bookmark |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | Undo / redo annotation operations |
| `Ctrl/Cmd+F` or `/` | Search; `Enter` / `Shift+Enter` next/prev |
| `G` | Go to page |
| `S` | Toggle sidebar |
| `T` / `Shift+T` | Theme popover / cycle theme |
| `F` | Distraction-free mode (P1) |
| `Ctrl/Cmd` `+` `-` `0` | Zoom in / out / fit |
| `?` | Shortcut cheat sheet |

Not used on purpose: modifier-only chords, `Ctrl+D`, `Ctrl+B`, `Alt+letter` (browser-reserved).

**Mobile**

| Gesture | Action |
|---|---|
| Tap a text line | Select line, show toolbar |
| Tap blank area | Toggle chrome / dismiss toolbar |
| Long-press | Native word selection, then toolbar |
| Drag selection handles | Extend selection |
| Tap gutter marker | Open note/bookmark popover |
| Pinch | Zoom |
| Double-tap blank area | Toggle fit-width / 200 % (P1) |
| Bookmark button (bottom bar / toolbar) | Quick bookmark |
| Panel button / swipe up | Open annotation bottom sheet |

## Appendix B — Test corpus (`fixtures/pdfs/`)

Prefer **generated** PDFs (LaTeX, Typst, ReportLab, pdf-lib) so licensing is clean and line ground truth is known by construction; otherwise public-domain or CC sources. Record provenance in `fixtures/pdfs/README.md`.

| # | Fixture | Purpose |
|---|---|---|
| 1 | Single-column prose (public-domain book) | Baseline line segmentation, hyphenation |
| 2 | Two-column academic paper | XY-cut, column order |
| 3 | Textbook with sidebars and footnotes | Regions, footnote ordering |
| 4 | 16:9 slide deck | Large text, images, short lines |
| 5 | Table-heavy report | Cell vs row lines |
| 6 | Math-heavy LaTeX | Super/subscripts, fractions |
| 7 | Code listings | Monospace, long lines |
| 8 | Scanned, no text layer | `hasTextLayer: false`, filter theme |
| 9 | Scanned with hidden OCR text | Text layer misaligned with image |
| 10 | `/Rotate 90` and mixed orientation | Canonical space correctness |
| 11 | Devanagari + CJK samples | No-crash guarantee |
| 12 | 500+ pages, ~40 to 50 MB | Performance, memory, canvas caps |
| 13 | Password-protected | Password flow |
| 14 | Corrupt / truncated | Error states |

## Appendix C — Kickoff prompts for Claude Code

Use these as the first message of a fresh session. Always begin with plan mode and ask for the list of files to be touched.

- **S1**: *"Read CLAUDE.md and docs/PRD.md §1.3, §8.2, §8.5, §11 (S1) and Appendix B. Do spike S1 only, under `spikes/line-engine/`. Generate synthetic fixtures with known line boundaries, implement `buildPageLines` per §8.5, add golden tests and an F1 + latency report script, and render PNG overlays of predicted lines for 20 real pages. Write the result and a go/no-go to `docs/adr/0001-line-engine.md`. Do not scaffold the app."*
- **S2/S3/S4/S5**: same pattern, one spike per session, citing the matching §§ and exit criteria.
- **M1**: *"Read docs/PRD.md §4, §8, §9, §11 (M1). Implement T-100 only. Stop after CI is green and summarise."* Then T-101, T-102, … one per session.
- **M2 (example)**: *"Implement T-203 (line selection + toolbar). Requirements: FR-LIN-01..04. Constraints: §8.2 rules 1–5. Write Playwright tests for tap-vs-drag and line-cursor navigation. Do not touch sync."*
- **Review prompt (after every task)**: *"Review the diff against the cited requirement IDs and §8.2 rules. List violations, missing tests, and anything that expands scope."*

## Appendix D — Definition of done (every task)

1. Cites the requirement IDs it implements; no behaviour outside them.
2. `pnpm typecheck`, `pnpm lint`, `pnpm test` pass; new logic in `core/*` has unit tests; user-visible behaviour has a Playwright test where feasible.
3. Layering rules (§8.2) respected; no new dependency without a one-line justification in the PR.
4. Accessibility: keyboard path and accessible names for new controls.
5. Docs updated: PRD if a decision changed, ADR if an architecture choice was made.
6. Manual check on a mobile viewport for any UI change.

