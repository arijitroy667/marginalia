# ADR 0006 — Toolchain versions (T-100)

- Status: accepted (2026-10-02)
- Requirements: PRD §8.3, NFR-SEC-07

## Decision

Latest stable at scaffold time, exact versions in `package.json` + `pnpm-lock.yaml`:

| Tool | Version | Note |
|---|---|---|
| Node | 22 LTS | `engines` + CI |
| pnpm | 10.28.0 | `packageManager`; install scripts allowed only for `supabase`, `esbuild` |
| **TypeScript** | **6.0.3** | Not 7.x: typescript-eslint 8.71 supports `>=4.8.4 <6.1.0`. TS 6 lists `types` explicitly (no implicit `@types`). Revisit when typescript-eslint supports 7. |
| Vite / @vitejs/plugin-react | 8.3.2 / 6.1.1 | |
| React / React Router | 19.3.0 / 8.4.0 | |
| Vitest / Playwright | 5.0.3 / 1.63.0 | Playwright projects: Chromium, WebKit, Pixel 7, iPhone 14 |
| ESLint / typescript-eslint | 10.11.0 / 8.71.0 | type-checked rules; `react-hooks` 7 (`recommended-latest`) |
| Tailwind CSS | 4.3.3 | CSS-first config via `@tailwindcss/vite` |
| **pdfjs-dist** | **6.3.289** (exact) | ≥ 4.2.67 (CVE-2024-4367 fix); upgrades need a golden + S2 re-run (R9) |
| @supabase/supabase-js / supabase CLI | 2.117.2 / 2.119.0 | |
| tus-js-client | 4.3.1 | |

Three TypeScript projects behind a solution `tsconfig.json`: `tsconfig.app.json` (DOM, `src/`),
`tsconfig.node.json` (configs, scripts, tests, e2e) and `tsconfig.core.json` (`src/core/line-engine`,
`src/core/anchors` with **no DOM lib and no types**), so CLAUDE.md rule 1 fails the typecheck, not just a
review. ESLint `no-restricted-imports` blocks Supabase outside `core/{sync,auth,supabase}` (rule 2) and
React/PDF.js/Dexie/feature imports inside the pure core; `no-restricted-syntax` blocks
`dangerouslySetInnerHTML` (NFR-SEC-05).
