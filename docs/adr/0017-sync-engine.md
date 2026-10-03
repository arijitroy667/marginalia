# ADR 0017 — Sync engine (T-300)

- Status: accepted (2026-10-03); running against the hosted project since T-103 (ADR 0018)
- Requirements: FR-SYN-02..05, FR-SYN-08, PRD §8.8, ADR 0005/0007

## Decision

1. **Layers.** `core/sync/engine.ts` (push, pull, apply) talks to a `SyncTransport` interface;
   `supabaseTransport.ts` is the PostgREST implementation; `scheduler.ts` decides when to run and what status to
   show; `index.ts` owns the one running scheduler, started by the auth layer after sign-in. Tests drive the
   engine against an in-memory server that mimics the schema (trigger timestamps, FKs, checks) and two local
   databases ("devices").
2. **Push** takes pending outbox items **by entity in FK order** (documents → annotations → positions → settings),
   then by `seq`: write-time coalescing gives a re-saved document a newer seq than its annotations, so plain seq
   order would push children first. Batches of `PUSH_BATCH_SIZE` upsert on `id` (positions on
   `(user_id, document_id)`), never sending `user_id` (column default) or `updated_at` (trigger). The response's
   server `updated_at` is written back to the local row unless a newer local edit is pending, so later
   last-write-wins comparisons use server time, not a skewed client clock. Only the sent seqs are removed: an edit
   made during the request stays pending.
3. **Errors.** 401 → `auth` (session refresh or sign-in; outbox kept). 0/408/409/429/5xx → retryable: items stay
   `pending` with `attempts` and `lastError`, the scheduler backs off 1 s → 60 s (±50 % jitter). Other 4xx are
   permanent: the failing statement is retried row by row so only the bad row becomes `failed` (Sync issues
   screen, FR-SYN-10); nothing is dropped silently. 409 stays retryable until T-301 adds the duplicate-document
   merge.
4. **Pull** per table by keyset `(updated_at, key)` (key = `id`, positions: `document_id`), 500 rows a page, with
   a 5 s overlap at the start of each pull only (paging inside a pull uses the exact cursor, so a burst of more
   than a page inside 5 s cannot loop). Cursors keep the server's full-precision timestamp. Each row is
   Zod-validated (invalid rows are ignored, never written), skipped if the entity has a pending outbox item, else
   applied when `incoming.updated_at >= local.updated_at` (whole-row LWW by server time, FR-SYN-08).
5. **Scheduler.** Push then pull on start, `online`, back to the foreground (no Background Sync on iOS), 1 s
   after the last outbox write (debounced), every 30 s, and on Retry; one run at a time, a trigger during a run queues one more.
   Status: Synced · Syncing… · Offline · n pending · Sync error (Retry) / n changes need attention · Sign in to
   sync (FR-SYN-05). No status pill in local-only mode.

## Evidence

`src/core/sync/engine.test.ts` (11): FK push order, server timestamps written back, mid-push edits kept,
retryable vs 401 vs permanent errors with row isolation, paging + cursor + idempotent overlap, pending rows not
overwritten, invalid rows ignored, two-device concurrent edit / edit-vs-delete / settings sync.
`scheduler.test.ts` (6): backoff curve, offline, synced/error states, retry timing, 401, single flight.

## Follow-ups

T-102 (push the migration, generated types), T-103 (auth + `startSync`/`stopSync`, owner check), T-301 (409 on
`(user_id, content_hash)` → adopt the existing id), T-305 (Sync issues screen, chaos tests against the real
project), T-304 (Realtime, P1) through the same `apply`.

## Duplicate-document merge (T-301, FR-SYN-09)

A document push that fails with `23505` (the live `(user_id, content_hash)` index) means another device added the
same bytes first. The engine fetches that live document and, in one transaction, moves local annotations, the
reading position (keeping a newer local one if the target already has none), outbox payloads (position items
change their entity id too) and the cached file and cover to its id, deletes the local duplicate and stores the
server row. Annotations and positions then push under the adopted id in the same run. The local document's own
metadata (title, last opened) yields to the existing row. Tested with two offline "devices"
(`engine.test.ts`); the E2E with two browser contexts needs the live project (T-305).

## Realtime (T-304, FR-SYN-06)

`0002_realtime.sql` adds `annotations` and `reading_positions` to the `supabase_realtime` publication; Realtime
applies RLS, and the client also filters `user_id=eq.<uid>`. One channel per signed-in user (`core/sync/realtime.ts`)
feeds inserts and updates through the engine's `apply` — the same validation, pending-edit protection and LWW as
a pull; deletes are tombstones, so updates. Each (re)subscription runs a full sync, so events missed while
disconnected still arrive. supabase-js is imported type-only there, keeping it out of the app shell.

Measured against the hosted project (`e2e/cloud.spec.ts`): a highlight made on device A appears on device B, with
the book open and no reload, **~2.9 s** after the key press (1 s debounce, push, then ~1.5 s Realtime delivery) —
within FR-SYN-06's 5 s. The post-write delay was 5 s at first (6.5–7 s end to end); the owner chose 1 s on
2026-10-03 and FR-SYN-03 was updated.
