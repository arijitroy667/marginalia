import { useRegisterSW } from 'virtual:pwa-register/react';
import { en } from '../shared/i18n/en';
import { toast } from '../shared/ui/toast';

/** registerType 'prompt': a new version waits for the reader's consent, never reloads mid-read (§8.9). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onOfflineReady: () => toast(en.pwa.offlineReady) });
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ui-fg shadow-lg"
    >
      {en.pwa.updateAvailable}
      <button
        className="min-h-11 rounded-md bg-accent px-3 font-medium text-accent-fg"
        onClick={() => void updateServiceWorker(true)}
      >
        {en.pwa.reload}
      </button>
      <button className="min-h-11 rounded-md px-3 text-ui-fg" onClick={() => setNeedRefresh(false)}>
        {en.pwa.later}
      </button>
    </div>
  );
}
