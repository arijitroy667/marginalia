import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hasPdfHeader, sha256Blob } from './hash';

describe('sha256Blob', () => {
  it('matches node:crypto across chunk boundaries', async () => {
    for (const size of [0, 1, 4 * 1024 * 1024, 4 * 1024 * 1024 + 7, 9 * 1024 * 1024 + 3]) {
      const buf = randomBytes(size);
      expect(await sha256Blob(new Blob([buf]))).toBe(createHash('sha256').update(buf).digest('hex'));
    }
  });

  it('reports progress up to 1', async () => {
    const seen: number[] = [];
    await sha256Blob(new Blob([randomBytes(9 * 1024 * 1024)]), (f) => seen.push(f));
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});

describe('hasPdfHeader', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('accepts %PDF- at the start or after junk within 1024 bytes', () => {
    expect(hasPdfHeader(enc('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfHeader(enc(' '.repeat(500) + '%PDF-1.4'))).toBe(true);
  });
  it('rejects other files and late headers', () => {
    expect(hasPdfHeader(enc('PK\u0003\u0004 zip'))).toBe(false);
    expect(hasPdfHeader(enc(' '.repeat(1100) + '%PDF-1.4'))).toBe(false);
    expect(hasPdfHeader(new Uint8Array())).toBe(false);
  });
});
