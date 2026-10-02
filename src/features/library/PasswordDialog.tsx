import { Dialog } from 'radix-ui';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { en } from '../../shared/i18n/en';
import type { PasswordPrompt } from '../reader/pdf/pdfjs';

interface Request {
  name: string;
  retry: boolean;
  resolve: (pw: string | null) => void;
}

/** Promise-based password prompt (FR-LIB-01, FR-RDR-12): a prompt factory plus the dialog to render. */
export function usePasswordPrompt(): { prompt: (name: string) => PasswordPrompt; dialog: ReactNode } {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (name: string): PasswordPrompt =>
      (retry) =>
        new Promise((resolve) => setReq({ name, retry, resolve })),
    [],
  );
  const finish = (pw: string | null) => {
    req?.resolve(pw);
    setReq(null);
    setValue(''); // never kept
  };

  const dialog = (
    <Dialog.Root open={req !== null} onOpenChange={(open) => !open && finish(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 text-ui-fg shadow-xl"
        >
          <Dialog.Title className="text-lg font-semibold">{en.password.title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">{req && en.password.body(req.name)}</Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              finish(value);
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              {en.password.label}
              <input
                ref={input}
                type="password"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={req?.retry || undefined}
                aria-describedby={req?.retry ? 'pw-error' : undefined}
                className="min-h-11 rounded-md border border-line-strong bg-ui-bg px-3 text-ui-fg"
              />
            </label>
            {req?.retry && (
              <p id="pw-error" role="alert" className="text-sm font-medium text-ui-fg">
                {en.password.wrong}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="min-h-11 rounded-md px-4 text-ui-fg" onClick={() => finish(null)}>
                {en.common.cancel}
              </button>
              <button type="submit" className="min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg">
                {en.password.submit}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return { prompt, dialog };
}
