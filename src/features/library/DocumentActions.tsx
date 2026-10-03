import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import type { DocumentRow } from '../../core/db/models';
import { filesRepo, libraryRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { removeCloudFile } from '../../core/sync';
import { en } from '../../shared/i18n/en';
import { toast } from '../../shared/ui/toast';

const item = 'flex min-h-11 cursor-default items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-ui-bg';
const panel =
  'fixed left-1/2 top-1/2 z-50 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ui-fg shadow-xl';
const btn = 'min-h-11 rounded-md px-4 text-sm font-medium';

/** Per-book menu (FR-LIB-07, FR-LIB-08): rename, keep offline, delete (file only / everything). */
export function DocumentActions({ doc }: { doc: DocumentRow }) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [title, setTitle] = useState(doc.title);
  const file = useLiveQuery(() => db.files.get(doc.id), [doc.id]);
  const close = () => setDialog(null);

  const rename = async () => {
    const t = title.trim();
    if (t && t !== doc.title) await libraryRepo.rename(doc.id, t).catch(() => toast(en.reader.saveFailed));
    close();
  };
  const remove = async (mode: 'file' | 'all') => {
    close();
    try {
      const path =
        mode === 'file' ? await libraryRepo.deleteFileOnly(doc.id) : await libraryRepo.deleteEverything(doc.id);
      if (path) void removeCloudFile(path);
      toast(mode === 'file' ? en.library.fileDeleted(doc.title) : en.library.deleted(doc.title));
    } catch {
      toast(en.reader.saveFailed);
    }
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={en.library.actionsFor(doc.title)}
          className="absolute right-1 top-1 z-10 grid min-h-11 min-w-11 place-items-center rounded-full bg-surface/90 text-ui-fg shadow-sm hover:bg-ui-bg"
        >
          ⋯
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 text-sm text-ui-fg shadow-lg"
          >
            <DropdownMenu.Item className={item} onSelect={() => (setTitle(doc.title), setDialog('rename'))}>
              {en.library.rename}
            </DropdownMenu.Item>
            {file && (
              <DropdownMenu.CheckboxItem
                className={item}
                checked={file.pinned}
                onCheckedChange={(on) => void filesRepo.setPinned(doc.id, on)}
              >
                <span className="w-4">{file.pinned ? '✓' : ''}</span>
                {en.library.keepOffline}
              </DropdownMenu.CheckboxItem>
            )}
            <DropdownMenu.Item className={`${item} text-accent`} onSelect={() => setDialog('delete')}>
              {en.library.delete}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className={panel}>
            {dialog === 'rename' ? (
              <form onSubmit={(e) => (e.preventDefault(), void rename())} className="flex flex-col gap-3">
                <Dialog.Title className="text-lg font-semibold">{en.library.rename}</Dialog.Title>
                <Dialog.Description className="sr-only">{en.library.renameHint}</Dialog.Description>
                <input
                  aria-label={en.library.titleField}
                  value={title}
                  maxLength={500}
                  onChange={(e) => setTitle(e.target.value)}
                  className="min-h-11 rounded-md border border-line-strong bg-ui-bg px-2"
                />
                <div className="flex justify-end gap-2">
                  <Dialog.Close className={`${btn} hover:bg-ui-bg`}>{en.common.cancel}</Dialog.Close>
                  <button type="submit" className={`${btn} bg-accent text-accent-fg`}>
                    {en.library.save}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <Dialog.Title className="text-lg font-semibold">{en.library.deleteTitle(doc.title)}</Dialog.Title>
                <Dialog.Description className="text-sm text-muted">{en.library.deleteBody}</Dialog.Description>
                <button className={`${btn} border border-line-strong text-left`} onClick={() => void remove('file')}>
                  {en.library.deleteFileOnly}
                  <span className="block text-xs font-normal text-muted">{en.library.deleteFileOnlyHint}</span>
                </button>
                <button className={`${btn} bg-accent text-left text-accent-fg`} onClick={() => void remove('all')}>
                  {en.library.deleteEverything}
                  <span className="block text-xs font-normal opacity-90">{en.library.deleteEverythingHint}</span>
                </button>
                <Dialog.Close className={`${btn} self-end hover:bg-ui-bg`}>{en.common.cancel}</Dialog.Close>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
