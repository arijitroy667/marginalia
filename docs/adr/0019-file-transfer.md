# ADR 0019 — PDF file transfer, offline cache and attach (T-302)

- Status: accepted (2026-10-03)
- Requirements: FR-SYN-07, FR-LIB-05/06/08, PRD §8.8, ADR 0005

## Decision

1. **Object name** `pdfs/{user_id}/{content_hash}.pdf`: the same bytes from two devices are one object, the
   storage policy's first path segment is the owner, and re-uploads are idempotent.
2. **Upload** runs at the start of every sync run, before the row push: each cloud-mode, live document whose file
   is here and which has no `storagePath` is uploaded (skipped if the object already exists), then its
   `storagePath` is recorded — which goes out in the same push. TUS (6 MB chunks, fingerprints let an interrupted
   upload resume) above 6 MB, a plain upload below; `tus-js-client` loads only for large files. Failures wait for
   the next run. Files above `MAX_CLOUD_FILE_BYTES` stay `device` mode, and the add toast says so.
3. **Download** when a book is opened without its file: signed URL (10 min) + streamed `fetch` with a progress bar
   and Cancel; after a dropped connection it retries up to 3 times with `Range: bytes=n-` (restarting if the
   server ignores the range). The SHA-256 must equal `content_hash` or nothing is cached. A missing library cover
   is rendered on first open.
4. **Attach** (device-only books, books not uploaded yet, failed downloads, local-only mode): pick a file;
   accepted only if its SHA-256 matches.
5. **Cache** (FR-LIB-08): at most 5 files / 500 MB, least recently opened first — but only files that are in the
   bucket and not pinned are evicted; a device-only or not-yet-uploaded file is the only copy and is kept even
   over budget. The open book is never evicted. (`filesRepo.setPinned` exists; the "Keep offline" toggle lands
   with the library extras.)
6. **Quota meter**: Settings → Storage shows offline books, the browser's storage estimate, and the account's
   PDF bytes against the free plan's 1 GB (`CLOUD_STORAGE_BYTES`).

## Evidence

Unit: cache policy (4) — budget, LRU order, pinned / not-in-cloud never evicted, open book kept; downloads (4) —
Range resume after a dropped stream, restart when the range is ignored, hash mismatch never cached, attach
accepts only the same bytes. E2E: device-only attach (wrong file refused, right file opens); against the hosted
project, device A's file reaches `{user}/{hash}.pdf` and device B downloads, verifies and renders it with A's
highlight. Large-file TUS from the app is covered by the same endpoint and options as the tenancy suite's 7 MB
upload, not yet by an app-level E2E.

## Limits

- A download cancelled or failed after its retries starts over next time (no partial bytes persisted).
- Covers are not uploaded; each device renders its own when the file arrives.
