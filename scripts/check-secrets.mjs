// NFR-SEC-02: fail if a build ships the service-role key, the database password, or any service_role JWT.
// Run after building, before deploying: `pnpm build && pnpm check:secrets`. Prints file names only, never values.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* CI: no secrets present, the JWT role scan still runs */
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
let password = '';
try {
  password = decodeURIComponent(new URL(process.env.SUPABASE_DB_URL ?? '').password);
} catch {
  /* no database URL */
}

const leaks = [];
let files = 0;
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      scan(path);
      continue;
    }
    files++;
    const text = readFileSync(path, 'latin1');
    if (key && text.includes(key)) leaks.push(`${path}: service-role key`);
    if (password.length > 5 && text.includes(password)) leaks.push(`${path}: database password`);
    for (const m of text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\./g)) {
      try {
        if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') leaks.push(`${path}: service_role JWT`);
      } catch {
        /* not a JWT payload */
      }
    }
  }
}
for (const dir of ['dist', 'dist-cloud']) if (existsSync(dir)) scan(dir);
if (leaks.length) {
  console.error(`Secrets found in the build:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log(`check:secrets: ${files} files, no secrets.`);
