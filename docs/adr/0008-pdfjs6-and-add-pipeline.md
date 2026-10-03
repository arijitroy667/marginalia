# ADR 0008 — PDF.js 6 integration notes and the add-PDF pipeline (T-105)

- Status: accepted (2026-10-02)
- Requirements: PRD §8.4, FR-LIB-01..03/05, FR-SYN-07, NFR-SEC-03, NFR-PERF-08

## PDF.js 6.3.289 facts that change the PRD draft

- **`isEvalSupported` no longer exists.** The worker contains no `eval(`/`new Function(` paths (the class of
  code CVE-2024-4367 abused is gone), so the option is dropped and no CSP `unsafe-eval` is needed.
  NFR-SEC-03 still holds: exact pin, rendering in the worker, `enableXfa: false`.
- New asset options **`wasmUrl`** and **`iccUrl`** join `cMapUrl`/`standardFontDataUrl`; all four directories
  are copied from `pdfjs-dist` to `public/pdfjs/` at dev/build start (git-ignored) and served same-origin.
- `PDFDocumentProxy.destroy()` is gone: tear down with **`doc.loadingTask.destroy()`**.
- `PageViewport.convertToViewportRectangle()` is gone (ADR 0003): use `convertToViewportPoint`.
- `render({ canvas, viewport })` — the `canvasContext` form is deprecated.
- `pdf_viewer.mjs` reads `globalThis.pdfjsLib`, so the viewer components must be imported after the core.

## Opening files

`openPdf(blob, askPassword)` feeds PDF.js through a `PDFDataRangeTransport` that serves only the byte ranges
it requests via `blob.slice()`, so the main thread never holds a full copy of a 200 MB file. Passwords use
`loadingTask.onPassword` with a promise-based Radix dialog (retry on `INCORRECT_PASSWORD`, cancel destroys
the task); the password is never stored or logged (tested by scanning the local DB).

## Add pipeline (FR-LIB-01..03)

1. Size: empty and > `MAX_FILE_BYTES` (200 MB) are rejected.
2. **Magic bytes decide** (`%PDF-` within the first 1024 bytes), not the MIME type, which pickers often omit
   or get wrong.
3. Streaming SHA-256 with `@noble/hashes` (pure JS, ~250 MB/s desktop, 4 MB slices, progress callback).
   WebCrypto is faster but not incremental; WASM hashers would need `wasm-unsafe-eval`.
4. Dedupe on live rows; the hash is re-checked **inside** the write transaction so concurrent adds of the
   same bytes yield one document. Same bytes ⇒ open the existing document.
5. Metadata: `info.Title` unless empty/"untitled", else the file name; `info.Author`; `numPages`.
6. Cover: page 1 at ≤ 320 px wide (height ≤ 640), WebP if the browser encodes it, else JPEG, quality stepped
   down until ≤ 40 KB.
7. One transaction stores file Blob + cover + document row + outbox entry. `storageMode` = `device` above
   `MAX_CLOUD_FILE_BYTES` (50 MB, ADR 0005), else `cloud`.
8. `navigator.storage.persist()` once, on the first add (via `core/platform`).

## Test environment note

Playwright's WebKit cannot store Blobs in IndexedDB in its ephemeral contexts: writes of `Blob`/`File` abort
the transaction while strings and ArrayBuffers succeed. This holds on Windows *and* Linux (re-checked
2026-10-03 in the Playwright 1.63 Linux image; an earlier note assumed Linux CI was unaffected — it is not).
Safari on macOS/iOS stores Blobs. The PRD specifies Blob storage (FR-LIB-06), which keeps large files
disk-backed, so the design stays; tests that store a PDF skip in WebKit (`e2e/helpers.ts: noIdbBlobs`) and the
Safari path is covered by the real-device checklist. Phone layouts are still exercised in Pixel 7 emulation
(Chromium). A storage failure is reported to the user as such ("could not be saved on this device"), not as a
damaged file; `e2e/add-pdf.spec.ts` checks that message using this WebKit limitation as the reproduction.
