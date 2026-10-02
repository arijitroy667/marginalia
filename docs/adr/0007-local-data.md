# ADR 0007 — Local database, repositories and outbox (T-104)

- Status: accepted (2026-10-02)
- Requirements: PRD §8.2 rules 3/6/7, §8.8, §9.2, FR-SYN-02/03/10, FR-KEY-06, NFR-REL-01/02

## Decisions

1. **Local rows carry no `user_id`.** The server column defaults to `auth.uid()`; RLS and the composite
   owner FKs (ADR 0005) enforce it on push. The local database belongs to one account: it records its owner
   in `meta.ownerUserId` (T-103), and a different account signing in on the same device starts from an
   empty local database (after the sign-out "Remove data from this device" flow), so rows can never be
   pushed under the wrong account.
2. **Local-only mode.** If Supabase is not configured (`VITE_SUPABASE_URL` missing), the app runs fully
   local: library, reader and annotations work, nothing syncs, no sign-in is required. This is also how
   the E2E suite runs without secrets. With Supabase configured, sign-in is required (T-103).
3. **Repositories are the only write path.** Each mutation Zod-validates the full row (refinements mirror
   the SQL constraints), then writes the row and its outbox snapshot in one Dexie transaction. If either
   write fails, both roll back (tested).
4. **Write-time coalescing.** Enqueueing deletes older outbox items for the same `(entity, entityId)` in the
   same transaction. Payloads are full snapshots, so the newest one carries everything (FR-SYN-03 "same-entity
   upserts coalesce", with nothing dropped silently). An in-flight push of a superseded item is harmless: its
   later delete/update is a no-op.
5. **Outbox `status: 'pending' | 'failed'`** (indexed) backs the "Sync issues" screen (FR-SYN-10). Deletes are
   tombstones: `op: 'delete'` is an upsert carrying `deletedAt`, kept distinct for the issues screen.
6. **Timestamps.** `updatedAt` on a local write is provisional client time; the server trigger value replaces
   it after push. Pull never overwrites rows with a pending outbox entry, so client clock skew cannot win.
7. **Settings** live in `meta.settings` (`{ settings, updatedAt, localUpdatedAt }`), synced as
   `profiles.settings` (entity `settings`, id `profile`). The schema is a loose Zod object with defaults:
   keys written by newer clients survive this client's whole-row push, and missing keys get defaults.
   The theme alone is cached in `localStorage` to avoid a flash while IndexedDB opens.

## Evidence

`src/core/db/repos.test.ts` (fake-indexeddb, 11 tests): atomic row+outbox, rollback on a failed outbox
write, coalescing, tombstones, hash dedupe on live rows, constraint mirroring, undo-restore keeps the id,
seq ordering (documents before children), position upsert, settings defaults/loose keys. E2E: the theme
survives a reload and is stored in IndexedDB.
