# Deploying Marginalia (T-407)

The app is a static site (`dist/`) plus your Supabase project. Any static host with HTTPS and custom headers works.

## 1. Supabase (production)

1. A Supabase project for production (keep a separate one for development and tests).
2. `SUPABASE_DB_URL=… pnpm db:push` applies `supabase/migrations/*` (needs outbound port 5432; on networks that block
   it, use another network or paste the migrations into the Dashboard SQL editor in order).
3. Run the tenancy suite once against it with a test-only service key: `pnpm test:db` (it creates and deletes two
   throwaway users).
4. Authentication → URL Configuration: **Site URL** = your app URL; **Redirect URLs** = your app URL (and
   `http://localhost:5173` for development). Providers → Google: enable with a Google OAuth client whose authorised
   redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Storage: the `pdfs` bucket and its policies come from the migration. On the free plan the per-file limit is 50 MB
   (`MAX_CLOUD_FILE_BYTES`); larger books stay on the device that added them.

## 2. Build

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key> pnpm build
pnpm check:secrets   # fails if the service-role key, DB password or a service_role JWT is in dist/
```

Only `VITE_*` values reach the browser. The build writes a Content-Security-Policy `<meta>` tag whose `connect-src`
allows exactly this project (REST, Realtime and the TUS storage host).

## 3. Host

- Serve `dist/`; unknown paths fall back to `index.html` (client-side routes).
- Caching: `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest` with `Cache-Control: no-cache`;
  everything under `/assets/` with `Cache-Control: public, max-age=31536000, immutable`.
- Response headers (a `<meta>` CSP cannot set `frame-ancestors`, so the host adds the clickjacking protection):

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## 4. After deploying

- Open the app, sign in with an email link and with Google, add a PDF, highlight, reload, open on a second device.
- Lighthouse against the deployed URL (`npx @lhci/cli@0.14.0 collect --url=<url>`); budgets in `lighthouserc.json`.
- Walk the M4 section of `docs/qa-checklist.md` on a real Android phone and a real iPhone.
- Tag the release: `git tag -a v1.0.0 -m "Marginalia 1.0"`.
