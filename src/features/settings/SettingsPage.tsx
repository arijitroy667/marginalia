import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import { CLOUD_STORAGE_BYTES } from '../../config';
import { documentsRepo, filesRepo, settingsRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { useNavigate } from 'react-router';
import { signOut, unsyncedChanges } from '../../core/auth';
import { en } from '../../shared/i18n/en';
import { useAuth } from '../auth/useAuth';
import { exportJson } from '../export/exportJson';
import { CacheBudget, PaletteSection, ReadingSection, ShortcutsSection } from './sections';

const size = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);

/** Quota meter (FR-LIB-05): device storage, offline cache, and the account's PDF storage. */
function StorageSection({ cloud }: { cloud: boolean }) {
  const cached = useLiveQuery(() => filesRepo.usage(), []);
  const cloudBytes = useLiveQuery(() => documentsRepo.cloudBytes(), []);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => void platform.storageEstimate().then(setEstimate), [cached]);
  const bar = (value: number, max: number, label: string) => (
    <progress className="h-2 w-full accent-[var(--accent)]" aria-label={label} max={max} value={Math.min(value, max)} />
  );
  return (
    <section aria-labelledby="set-storage" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <h2 id="set-storage" className="font-medium">
        {en.settings.storage}
      </h2>
      {cached && <p className="text-sm text-muted">{en.settings.cachedFiles(cached.count, size(cached.bytes))}</p>}
      {estimate && estimate.quota > 0 && (
        <>
          <p className="text-sm text-muted">{en.settings.deviceStorage(size(estimate.usage), size(estimate.quota))}</p>
          {bar(estimate.usage, estimate.quota, en.settings.storage)}
        </>
      )}
      <CacheBudget />
      {cloud && cloudBytes !== undefined && (
        <>
          <p className="text-sm text-muted">{en.settings.cloudStorage(size(cloudBytes), size(CLOUD_STORAGE_BYTES))}</p>
          {bar(cloudBytes, CLOUD_STORAGE_BYTES, en.settings.account)}
        </>
      )}
    </section>
  );
}

/** Settings (T-401 fills in palette, shortcuts, cache budget): account (FR-SYN-01) and storage (FR-LIB-05). */
export function SettingsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState(false);
  const [pending, setPending] = useState(0);
  const btn = 'min-h-11 rounded-md px-4 font-medium';

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{en.settings.title}</h1>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-medium">{en.settings.account}</h2>
        {auth.status === 'signed-in' ? (
          <>
            <p className="text-sm text-muted">{en.settings.signedInAs(auth.email)}</p>
            <button
              className={`${btn} self-start border border-line-strong`}
              onClick={() => void unsyncedChanges().then((n) => (setPending(n), setRemove(false), setOpen(true)))}
            >
              {en.auth.signOut}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">{en.settings.localOnly}</p>
        )}
      </div>
      <ReadingSection />
      <PaletteSection />
      <ShortcutsSection />
      <StorageSection cloud={auth.status === 'signed-in'} />
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-medium">{en.settings.data}</h2>
        <p className="text-sm text-muted">{en.settings.exportAllHint}</p>
        <button
          className={`${btn} self-start border border-line-strong`}
          onClick={() =>
            void Promise.all([
              db.documents.toArray(),
              db.annotations.toArray(),
              db.positions.toArray(),
              settingsRepo.get(),
            ]).then(([documents, annotations, positions, settings]) =>
              platform.saveFile(
                `marginalia-export-${new Date().toISOString().slice(0, 10)}.json`,
                exportJson({ documents, annotations, positions, settings }),
                'application/json',
              ),
            )
          }
        >
          {en.settings.exportAll}
        </button>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ui-fg shadow-xl">
            <Dialog.Title className="text-lg font-semibold">{en.auth.signOutTitle}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted">{en.auth.signOutBody}</Dialog.Description>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              {en.auth.removeData}
            </label>
            {remove && pending > 0 && (
              <p role="alert" className="text-sm text-accent">
                {en.auth.unsyncedWarning(pending)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close className={`${btn} hover:bg-ui-bg`}>{en.common.cancel}</Dialog.Close>
              <button
                className={`${btn} bg-accent text-accent-fg`}
                onClick={() =>
                  void signOut(remove).then(() => {
                    setOpen(false);
                    void navigate('/login', { replace: true });
                  })
                }
              >
                {en.auth.signOut}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
