import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}', 'spikes/**/*.test.ts'], environment: 'node' } },
      // needs a Supabase project (.env.local) or `supabase start`; skipped without credentials
      { test: { name: 'db', include: ['supabase/tests/**/*.test.ts'], environment: 'node', testTimeout: 30_000 } },
    ],
  },
});
