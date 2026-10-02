import { DropdownMenu } from 'radix-ui';
import { en } from '../../shared/i18n/en';
import { CheckIcon, ThemeIcon } from '../../shared/ui/icons';
import { updateSettings, useSettings } from '../settings/useSettings';
import type { ThemeId } from './tokens';

const OPTIONS: ThemeId[] = ['system', 'light', 'warm', 'dark'];

/** Theme picker for the app chrome (FR-THM-01); keyboard-reachable Radix menu. */
export function ThemeMenu() {
  const { theme } = useSettings();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={en.theme.label}
        className="grid min-h-11 min-w-11 place-items-center rounded-md text-ui-fg hover:bg-ui-bg"
      >
        <ThemeIcon />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-lg border border-line bg-surface p-1 text-sm text-ui-fg shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted">{en.theme.label}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => void updateSettings({ theme: v as ThemeId })}>
            {OPTIONS.map((id) => (
              <DropdownMenu.RadioItem
                key={id}
                value={id}
                className="flex min-h-11 cursor-default items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-ui-bg"
              >
                <span className="w-5">
                  <DropdownMenu.ItemIndicator>
                    <CheckIcon width={16} height={16} />
                  </DropdownMenu.ItemIndicator>
                </span>
                {en.theme[id]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
