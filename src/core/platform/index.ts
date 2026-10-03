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
  /**
   * How this app can be installed here (§10.5): `prompt` (the browser offered an install prompt), `ios` (Safari on
   * iPhone/iPad: Share -> Add to Home Screen, no prompt API), `installed`, or `none`.
   */
  installState(): InstallState;
  /** Show the browser's install prompt (only when `installState()` is `prompt`); true if accepted. */
  promptInstall(): Promise<boolean>;
  /** Notified when `installState()` changes (prompt offered, app installed). */
  onInstallChange(listener: () => void): () => void;
}

export type InstallState = 'prompt' | 'ios' | 'installed' | 'none';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The prompt event fires early and only once: capture it at module load (the app imports this at startup).
let deferred: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we offer it from our own button
    deferred = e as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notifyInstall();
  });
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const iosSafari = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const platform: Platform = {
  installState: () => (standalone() ? 'installed' : deferred ? 'prompt' : iosSafari() ? 'ios' : 'none'),
  async promptInstall() {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    notifyInstall();
    return outcome === 'accepted';
  },
  onInstallChange(listener) {
    installListeners.add(listener);
    return () => void installListeners.delete(listener);
  },
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
