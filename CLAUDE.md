# CLAUDE.md — Marginalia (line-level PDF reader, PWA)

Source of truth: `docs/PRD.md`. Read the section named in your task before coding. If code and PRD disagree or a requirement is ambiguous, **stop and ask**, then update the PRD in the same PR.

## What this is
A book-style PDF reader where the *line* is a first-class object: one-action highlight (user-defined colour meanings), per-line bookmarks with auto-resume, per-line notes with gutter markers, themes that recolour the document. React + TypeScript PWA, PDF.js, Dexie (IndexedDB) local-first, Supabase (Postgres/Auth/Storage) as cloud source of truth.

## Commands
- `pnpm dev` · `pnpm build` · `pnpm typecheck` (app + node + pure-core projects) · `pnpm lint` · `pnpm test` (Vitest unit) · `pnpm e2e` (Playwright vs production build: Chromium, WebKit, Pixel 7, iPhone 14)
- Hosted Supabase via `.env.local` (see `.env.example`): `pnpm db:push` (migrations) · `pnpm db:types > src/core/supabase/types.ts` · `pnpm test:db` (two-user tenancy suite)
- Fixtures: `python fixtures/generate.py [--large] [--force]` · real review corpus: `node fixtures/fetch-real.mjs`
- Linux WebKit/iPhone E2E from Windows (Docker): see `scripts/e2e-linux.sh` · perf budgets: `PERF=1 pnpm exec playwright test e2e/perf.spec.ts --workers 1`

## Architecture rules (hard)
1. `src/core/line-engine` and `src/core/anchors` are pure TS: no React, DOM, Supabase, or PDF.js types.
2. Only `src/core/{sync,auth,supabase}` may import `@supabase/supabase-js`. UI never talks to Supabase.
3. UI reads only from Dexie (`useLiveQuery`); writes only via repositories, which write the row **and** its outbox entry in one Dexie transaction.
4. Non-portable APIs (file picker, share, storage persist, install prompt) go behind `src/core/platform/` interfaces (Capacitor-ready).
5. Store geometry **normalised 0..1 in canonical page space, top-left origin**. Never persist pixels or zoom-dependent values. Conversions only in `core/anchors/geometry.ts`.
6. Annotations render from their stored `rects`; the Line Engine is used only to create new anchors and for line navigation.
7. Annotation overlays are DOM/SVG layers, never drawn into the PDF canvas.
8. Strict TS, no `any`; Zod at every boundary. No domain data in `localStorage`.
9. Do not monkey-patch PDF.js; use its public API and `EventBus`. `pdfjs-dist` is pinned to an exact version; upgrades are deliberate and need a golden-test run.
10. Server timestamps (`updated_at`) come from DB triggers; conflict policy is whole-row last-write-wins.

## Known gotchas
- iOS Safari canvas ceiling is 16,777,216 px; cap DPR; free off-screen canvases with `width = height = 0`.
- PDF.js needs `cmaps/` and `standard_fonts/` served from `public/pdfjs/` and precached for offline.
- Treat uploaded PDFs as untrusted input (worker rendering, `enableXfa: false`; PDF.js 6 has no `isEvalSupported`/eval paths — ADR 0008).
- Playwright WebKit on Windows cannot store Blobs in IndexedDB; PDF-storing E2E tests skip there (`noIdbBlobs`), Linux CI runs them.
- Single-key shortcuts must not fire in text fields or during IME composition. No modifier-only chords.
- Playwright WebKit is not iOS Safari; real-device checks are required at milestone exits.
- iOS has no Background Sync: flush the outbox on foreground/online only.

## Workflow
- One PRD task (`T-xxx`) per session. Plan first; list files you will touch; keep PRs small.
- Cite requirement IDs (`FR-*`, `NFR-*`) in commits/PRs. Do not build P2 items before M4 exit.
- Tests are mandatory for everything in `core/*`; add Playwright coverage for user-visible behaviour.
- New dependency ⇒ one-line justification in the PR. Architecture decision ⇒ short ADR in `docs/adr/`.
- Before saying "done": typecheck, lint, tests pass; check the UI at a mobile viewport.

## Never
- Read or write Supabase from components; store secrets or the service-role key in the repo; log PDF text or notes; render raw HTML from notes; add features not in the PRD without asking.
