# ADR 0022 — Security review (T-404)

- Status: accepted (2026-10-03)
- Requirements: NFR-SEC-01..07

| Requirement | Result |
|---|---|
| NFR-SEC-01 tenancy | `pnpm test:db` 7/7 against the hosted project after `0002_realtime` (RLS on every table and the `pdfs` bucket, composite owner FKs). Realtime applies RLS; the client filters by `user_id` as well. |
| NFR-SEC-02 secrets | `pnpm check:secrets` (also in CI after the build) scans `dist/` and `dist-cloud/` for the service-role key, the database password and any `service_role` JWT, printing file names only: clean (444 files). Only the URL and anon key reach the browser; `.env.local` is git-ignored. |
| NFR-SEC-03 untrusted PDFs | `pdfjs-dist` 6.3.289 pinned (past CVE-2024-4367; no eval paths), worker rendering, `enableXfa: false` (ADR 0008). |
| NFR-SEC-04 CSP | Production builds carry a meta CSP: `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` (PDF.js image decoders), `style-src 'self'`, `img-src 'self' blob: data:`, `font-src 'self'`, `connect-src 'self'` + this app's Supabase origin, its `wss:` Realtime and TUS storage host, `object-src 'none'`, `frame-src 'none'`, `base-uri`/`form-action 'self'`. No `unsafe-eval`, no inline scripts, no inline styles needed. `e2e/csp.spec.ts` records every `securitypolicyviolation` while adding and reading a text PDF and an image-heavy deck, annotating, Dark theme with image restore, and settings: none. The cloud suites (auth, REST, Realtime, uploads/downloads) run under the same CSP. Zod's JIT probe (`new Function`) was the one violation found; Zod runs `jitless` (`src/zodConfig.ts`, imported first). A meta CSP cannot set `frame-ancestors`: the host adds it as a header (T-407). |
| NFR-SEC-05 XSS | Notes render through a small Markdown AST → React elements (ADR 0016); lint now forbids `dangerouslySetInnerHTML` and `innerHTML` assignments in `src/`. |
| NFR-SEC-06 privacy | No logging in the app: lint `no-console` is an error in `src/`. No analytics, no error reporting, no third-party scripts (the CSP would block them). The Sync issues screen shows server messages, never payloads. |
| NFR-SEC-07 supply chain | `pnpm audit --prod --audit-level high`: no known vulnerabilities; CI runs it with a frozen-lockfile install. |
