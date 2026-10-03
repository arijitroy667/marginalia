# Marginalia

A PDF reader for people who read books, where the **line** is the thing you work with. Tap a line and highlight
it in one more tap, with colours that mean something to you. Bookmark it with one key. Write a note next to it.
Close the book on your phone and open it on your laptop at the same line.

It is a Progressive Web App: it installs from the browser, works offline, and keeps everything on your device
first, syncing to your own Supabase project when you sign in.

## What it does

- **Lines, not pages.** Click or tap a line to select it; `J`/`K` or the arrows move line by line across columns
  and pages; drag for any text range. Works on two-column papers, slides and scanned pages (region highlights).
- **Highlights with meanings.** Up to 8 colours, each with a label (Key idea, Definition, Look up, …). `H` applies
  the active colour; `1`–`8` pick one. Same colour again removes it; Undo everywhere (`Ctrl/Cmd+Z`).
- **Bookmarks and resume.** `B` bookmarks the line (or the line you are reading); `[` `]` jump between them.
  Every book reopens at the exact line, on any device ("Continue from Pixel 7, p. 41?").
- **Notes on lines.** `N` opens a note anchored to the line; autosaved; Markdown; a marker in the margin.
- **Annotation panel and search.** Everything in a book by page, filtered by colour or text; search across the
  whole library; export a book as Markdown or JSON.
- **Themes that recolour the page.** Light, Warm and Dark change the document itself, keep photos natural, and
  add a warmth slider for night reading.
- **Sync.** Local-first with an outbox: works offline, syncs in about 3 seconds when online, merges two devices'
  offline edits, and never drops a change silently (a Sync issues screen lists anything the server refused).
- **Keyboard and screen reader friendly.** Every action has a key (`?` lists them, remappable in Settings);
  WCAG 2.2 AA audited.

## Run it

Requirements: Node 22+, pnpm 10, a browser. Optional: a Supabase project for sign-in and sync.

```sh
pnpm install
pnpm dev            # http://localhost:5173, local-only (no account needed)
```

To sync between devices, create a Supabase project, copy `.env.example` to `.env.local` and fill it in (it is
git-ignored; the service-role key and database URL are for tests and migrations only and never reach the browser),
then:

```sh
pnpm db:push        # apply supabase/migrations to the project
pnpm test:db        # two-user tenancy suite: RLS on every table and the file bucket
```

In the Supabase dashboard: Authentication → URL Configuration → add your app's URLs to Redirect URLs; enable the
Google provider if you want "Continue with Google".

## Check it

```sh
pnpm check          # typecheck + lint + unit tests (Vitest)
pnpm e2e            # Playwright against the production build: Chromium, WebKit, Pixel 7, iPhone 14
                    # (cloud specs run too when .env.local exists)
pnpm build && pnpm check:secrets   # no service-role key or DB password in the bundle
PERF=1 pnpm exec playwright test e2e/perf.spec.ts --workers 1   # performance budgets (python fixtures/generate.py --large first)
```

## How it is built

React + TypeScript, PDF.js 6 (pinned) for rendering, a pure-TypeScript **Line Engine** that reconstructs visual
lines from PDF text items, Dexie (IndexedDB) as the local source for the UI, and Supabase (Postgres with Row Level
Security, Auth, Storage, Realtime) as the cloud source of truth. Annotations are stored as normalised rectangles plus
a text quote, so they render at any zoom or rotation without re-running the engine.

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Decisions, with the evidence behind them: [`docs/adr/`](docs/adr)
- Performance measurements: [`docs/performance.md`](docs/performance.md)
- Real-device checklist: [`docs/qa-checklist.md`](docs/qa-checklist.md)
- Deploying: [`docs/deploy.md`](docs/deploy.md) · Privacy: [`docs/privacy.md`](docs/privacy.md)
- Working rules for contributors and coding agents: [`CLAUDE.md`](CLAUDE.md)
