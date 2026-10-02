// Downloads the real-world review corpus into fixtures/pdfs/real/ (git-ignored; see README).
// Usage: node fixtures/fetch-real.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

export const REAL = [
  { file: 'acl-bert-N19-1423.pdf', url: 'https://aclanthology.org/N19-1423.pdf', license: 'CC BY 4.0 (ACL Anthology)' },
  { file: 'acl-energy-P19-1355.pdf', url: 'https://aclanthology.org/P19-1355.pdf', license: 'CC BY 4.0 (ACL Anthology)' },
  { file: 'acl-checklist-2020.pdf', url: 'https://aclanthology.org/2020.acl-main.442.pdf', license: 'CC BY 4.0 (ACL Anthology)' },
  { file: 'nist-fips-180-4.pdf', url: 'https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf', license: 'US Government work (public domain)' },
  { file: 'nist-sp-800-63b.pdf', url: 'https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63b.pdf', license: 'US Government work (public domain)' },
  { file: 'us-constitution-pocket.pdf', url: 'https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/pdf/CDOC-110hdoc50.pdf', license: 'US Government work (public domain)' },
];

const dir = new URL('./pdfs/real/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const { file, url } of REAL) {
  const dest = new URL(file, dir);
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, new Uint8Array(await res.arrayBuffer()));
  console.log('fetched', file);
}
