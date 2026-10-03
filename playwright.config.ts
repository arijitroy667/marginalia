import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// cloud specs (e2e/cloud*.spec.ts) need a Supabase project in .env.local; everything else runs local-only
const cloud = existsSync('.env.local');

// E2E runs against the production build (service worker, chunking and CSP behave as shipped).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: [
    {
      // local-only build: blank Supabase vars win over .env.local (Vite keeps existing env vars), ADR 0007
      command: 'pnpm build && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
    ...(cloud
      ? [
          {
            command:
              'pnpm exec vite build --outDir dist-cloud && pnpm exec vite preview --outDir dist-cloud --port 4174 --strictPort',
            url: 'http://localhost:4174',
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
          },
        ]
      : []),
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
