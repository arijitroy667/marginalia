// Supabase CLI wrapper that reads .env.local (cross-platform; no shell variable expansion needed).
// Usage: node scripts/db.mjs push | types
import { spawnSync } from 'node:child_process';

try {
  process.loadEnvFile('.env.local');
} catch {
  console.error('Missing .env.local (copy .env.example).');
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set in .env.local.');
  process.exit(1);
}
const cmd = process.argv[2];
const args = {
  push: ['db', 'push', '--db-url', url, '--yes'],
  types: ['gen', 'types', 'typescript', '--db-url', url, '--schema', 'public'],
}[cmd];
if (!args) {
  console.error('usage: node scripts/db.mjs push|types');
  process.exit(1);
}
// run the CLI's node launcher directly: no shell, so the password in the URL is never re-parsed
const cli = new URL('../node_modules/supabase/dist/supabase.js', import.meta.url);
const res = spawnSync(process.execPath, [cli.pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...args], {
  stdio: cmd === 'types' ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  encoding: 'utf8',
});
if (cmd === 'types' && res.status === 0) process.stdout.write(res.stdout);
process.exit(res.status ?? 1);
