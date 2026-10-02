import { Toast } from 'radix-ui';
import { useSyncExternalStore } from 'react';
import { en } from '../i18n/en';
import { CloseIcon } from './icons';

export interface ToastItem {
  id: number;
  title: string;
  action?: { label: string; run: () => void };
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a transient message, optionally with one action (e.g. Undo, FR-KEY-06). */
export function toast(title: string, action?: ToastItem['action']): void {
  items = [...items.slice(-2), { id: nextId++, title, ...(action ? { action } : {}) }];
  emit();
}
const dismiss = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

/** Radix Toast viewport: aria-live polite region, swipe/Escape to dismiss (NFR-A11Y-01). */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => items,
  );
  return (
    <Toast.Provider duration={5000}>
      {list.map((t) => (
        <Toast.Root
          key={t.id}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ui-fg shadow-lg"
        >
          <Toast.Title className="flex-1">{t.title}</Toast.Title>
          {t.action && (
            <Toast.Action altText={t.action.label} asChild>
              <button className="min-h-11 rounded px-2 font-semibold text-accent" onClick={t.action.run}>
                {t.action.label}
              </button>
            </Toast.Action>
          )}
          <Toast.Close aria-label={en.common.dismiss} className="grid min-h-11 min-w-11 place-items-center rounded text-muted">
            <CloseIcon width={16} height={16} />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
