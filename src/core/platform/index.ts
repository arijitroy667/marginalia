import { labelFromUserAgent } from '../../shared/utils/device';

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
  /** Human-readable name of this device ("Chrome on Windows", "iPhone"). */
  deviceLabel(): string;
  /** Copy plain text to the clipboard; false if refused. */
  copyText(text: string): Promise<boolean>;
  /** Hand a generated file to the user (download in browsers; share sheet / Files in a native wrapper). */
  saveFile(name: string, content: string, type: string): void;
}

export const platform: Platform = {
  saveFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  deviceLabel: () => labelFromUserAgent(navigator.userAgent, navigator.maxTouchPoints),
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
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
