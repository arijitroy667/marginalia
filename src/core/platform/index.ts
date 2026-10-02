/**
 * Non-portable APIs behind one seam (CLAUDE.md rule 4). A Capacitor build swaps this module's
 * implementation (native file picker, Filesystem, share sheet) without touching features.
 */
export interface Platform {
  /** Let the user pick PDF files; resolves [] if cancelled. */
  pickPdfFiles(): Promise<File[]>;
  /** Ask the browser not to evict our storage (FR-SYN-07, H7). */
  persistStorage(): Promise<boolean>;
  storageEstimate(): Promise<{ usage: number; quota: number } | null>;
}

export const platform: Platform = {
  pickPdfFiles() {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file',
        accept: 'application/pdf,.pdf',
        multiple: true,
      });
      input.addEventListener('change', () => resolve([...(input.files ?? [])]));
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    });
  },
  async persistStorage() {
    try {
      return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false);
    } catch {
      return false;
    }
  },
  async storageEstimate() {
    try {
      const e = await navigator.storage?.estimate?.();
      return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
    } catch {
      return null;
    }
  },
};
