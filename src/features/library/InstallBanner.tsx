import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { metaRepo } from '../../core/db/repos';
import { platform } from '../../core/platform';
import { en } from '../../shared/i18n/en';
import { toast } from '../../shared/ui/toast';

const DISMISSED = 'installBannerDismissed';

const useInstallState = () =>
  useSyncExternalStore(
    (l) => platform.onInstallChange(l),
    () => platform.installState(),
  );

/** "Install app" where the browser offers an install prompt (Android, desktop Chromium). */
export function InstallButton() {
  if (useInstallState() !== 'prompt') return null;
  return (
    <button
      className="min-h-11 rounded-md border border-line-strong px-3 text-sm"
      onClick={() => void platform.promptInstall().then((ok) => ok && toast(en.library.installed))}
    >
      {en.library.install}
    </button>
  );
}

/** iPhone/iPad Safari, not installed: how to add to the Home Screen and why (storage durability). */
export function IosInstallBanner() {
  const state = useInstallState();
  const dismissed = useLiveQuery(async () => (await metaRepo.get<boolean>(DISMISSED)) ?? false, []); // undefined = loading
  if (state !== 'ios' || dismissed !== false) return null;
  return (
    <aside
      aria-labelledby="ios-install"
      className="mt-4 flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-sm"
    >
      <h2 id="ios-install" className="font-medium">
        {en.library.iosInstallTitle}
      </h2>
      <p className="text-muted">{en.library.iosInstallBody}</p>
      <button
        className="min-h-11 self-start rounded-md px-3 text-accent hover:bg-ui-bg"
        onClick={() => void metaRepo.set(DISMISSED, true)}
      >
        {en.library.dismiss}
      </button>
    </aside>
  );
}
