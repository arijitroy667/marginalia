# ADR 0005 — Supabase: schema, tenancy test, uploads, plan limits (spike S5)

- Status: accepted (2026-10-03): migration applied to the hosted project, tenancy suite green
- Requirements: PRD §9.1, §8.8 (blob transfer), §11 S5, H6, R4, NFR-SEC-01/02, FR-SYN-07

## Environment decision

The owner chose a **hosted** Supabase project for development and tests (Docker is installed on the dev
machine but not used). Migrations are applied with `node scripts/db.mjs push` (Supabase CLI `db push
--db-url`, forward-only history in `supabase_migrations.schema_migrations`). CI runs the same migration
and tenancy suite against `supabase start` on a Docker-capable runner, so CI never needs production secrets.

## Plan facts (supabase.com/pricing and Storage docs, read 2026-10-02)

| Free plan | Value | Consequence |
|---|---|---|
| File storage | 1 GB | ≈ 20 × 50 MB books → `device` storage mode + quota meter (FR-LIB-05) |
| Max upload size | **50 MB** | `MAX_CLOUD_FILE_BYTES = 50 * 1024 * 1024`; bucket `file_size_limit = 52428800` |
| Egress | 5 GB + 5 GB cached / month | local Blob cache with LRU (FR-LIB-08) |
| Inactivity pause | after 1 week | a daily-driver needs Pro ($25/mo: 100 GB storage, 250 GB egress, 500 GB max upload) |
| Database | 500 MB | ample for annotations |
| Realtime | 200 concurrent connections, 2 M messages/month | fine for FR-SYN-06 (P1) |
| Projects | 2 active | one dev + one prod |

Resumable uploads (FR-SYN-07): TUS endpoint `https://<ref>.storage.supabase.co/storage/v1/upload/resumable`
(direct storage host), **chunk size exactly 6 MB**, metadata `bucketName/objectName/contentType/cacheControl`,
upload URLs valid 24 h, `x-upsert: true` lets the last writer win (same object name = same content hash, so
overwrites are idempotent).

## Schema change vs the §9.1 draft (PRD updated)

RLS only checks `user_id = auth.uid()` on the row itself; foreign-key targets are not covered. With a plain
`document_id → documents(id)` FK, user B could insert annotations or reading positions that point at user
A's document id (cross-tenant edges that A's cascade would delete). **Fix: `documents` gets
`unique (id, user_id)` and children use a composite FK `(document_id, user_id) → documents(id, user_id)`.**
The database itself enforces that a child row's owner equals its document's owner, with no per-row RLS
subquery.

## Tenancy test (`supabase/tests/rls.test.ts`, `pnpm test:db`)

Two throwaway users (admin API, test-only service key), then:

- profiles auto-created by trigger, visible only to the owner;
- B reads 0 rows and updates 0 rows of A's `documents`, `annotations` and `reading_positions`; B cannot
  tombstone A's document;
- B cannot insert a row with `user_id = A` (`42501`) or attach rows to A's document (`23503`, composite FK);
- constraints: `page = anchor.page`, highlight needs colour, note needs body, `content_hash` is 64 hex (`23514`);
- `updated_at` ignores a forged client value (trigger);
- storage: A uploads into `{A}/…`; B cannot download, list or write it; A cannot write into `{B}/…`;
- a 7 MB TUS upload by A succeeds with the exact size; the same upload by B into A's folder is refused.

Users are deleted afterwards (cascade removes their rows; their objects are removed explicitly).

## Results

2026-10-03, hosted project (region ap-northeast-2, session pooler on 5432):

- `pnpm db:push`: `0001_init.sql` applied cleanly (`Finished supabase db push`).
- `pnpm test:db`: **7 / 7 passed** in 28 s — both users isolated on every table and in the `pdfs` bucket,
  composite-FK cross-tenant edge refused, constraints, trigger-owned `updated_at`, 7 MB TUS upload.
- `pnpm db:types > src/core/supabase/types.ts`: generated (Prettier-formatted, excluded from lint). The sync
  client stays untyped on purpose: tables are addressed dynamically and every pulled row is Zod-validated
  (`core/sync/mapping.ts`), which is the boundary check rule 8 asks for.
- Network note: some networks block outbound 5432/6543 (seen on the dev machine's first network: every
  Supabase host and a public port-test server timed out). Migrations then need another network or the
  Dashboard SQL editor; the app itself only uses HTTPS.
