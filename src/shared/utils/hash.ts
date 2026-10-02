import { sha256 } from '@noble/hashes/sha2.js';

const CHUNK = 4 * 1024 * 1024;

/**
 * Streaming SHA-256 of a Blob as lowercase hex (FR-LIB-02): 4 MB slices, never the whole file in memory,
 * yields between slices so the UI stays responsive. Pure JS (~250 MB/s desktop), so no WASM CSP needed.
 */
export async function sha256Blob(blob: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const h = sha256.create();
  for (let at = 0; at < blob.size; at += CHUNK) {
    h.update(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()));
    onProgress?.(Math.min(1, (at + CHUNK) / blob.size));
  }
  return Array.from(h.digest(), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True if `%PDF-` occurs in the first 1024 bytes (where readers accept the header). */
export function hasPdfHeader(head: Uint8Array): boolean {
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i + sig.length <= Math.min(head.length, 1024); i++) if (sig.every((b, k) => head[i + k] === b)) return true;
  return false;
}
