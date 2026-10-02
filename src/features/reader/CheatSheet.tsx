import { Dialog } from 'radix-ui';
import { en } from '../../shared/i18n/en';
import { KEYMAP, type Action, type Binding, type Group } from './keymap';

const GROUPS: Group[] = ['lines', 'annotate', 'navigate', 'view'];
const NAMES: Record<string, string> = {
  ArrowDown: '↓',
  ArrowUp: '↑',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  PageDown: 'PgDn',
  PageUp: 'PgUp',
};
const mac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

function combos(b: Binding): string[] {
  const mods = [b.primary ? (mac() ? '⌘' : 'Ctrl') : '', b.shift ? 'Shift' : ''].filter(Boolean);
  const keys = b.action === 'colour' ? ['1–8'] : b.keys.map((k) => NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k));
  return keys.map((k) => [...mods, k].join('+'));
}

/** `?` cheat sheet (FR-KEY-03), generated from the keymap, plus the touch gestures (FR-KEY-05). */
export function CheatSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto rounded-xl border border-line bg-surface p-4 text-sm text-ui-fg shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{en.keys.title}</Dialog.Title>
            <Dialog.Close className="min-h-11 rounded-md px-3 text-accent hover:bg-ui-bg">
              {en.common.close}
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-muted">{en.keys.description}</Dialog.Description>
          <div className="grid gap-4 sm:grid-cols-2">
            {GROUPS.map((g) => {
              const actions = new Map<Action, string[]>();
              for (const b of KEYMAP.filter((b) => b.group === g))
                actions.set(b.action, [...(actions.get(b.action) ?? []), ...combos(b)]);
              return (
                <section key={g} aria-label={en.keys.groups[g]}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{en.keys.groups[g]}</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {[...actions].map(([action, keys]) => (
                      <div key={action} className="contents">
                        <dt className="flex flex-wrap gap-1">
                          {keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-line-strong bg-ui-bg px-1.5 font-mono text-xs"
                            >
                              {k}
                            </kbd>
                          ))}
                        </dt>
                        <dd>{en.keys.actions[action]}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
            <section aria-label={en.keys.touch}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{en.keys.touch}</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {en.keys.gestures.map(([g, what]) => (
                  <div key={g} className="contents">
                    <dt className="font-medium">{g}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
