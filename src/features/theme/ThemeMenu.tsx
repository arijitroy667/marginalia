import { Popover } from 'radix-ui';
import type { Ref } from 'react';
import type { BookTheme } from '../../core/db/models';
import { en } from '../../shared/i18n/en';
import { ThemeIcon } from '../../shared/ui/icons';
import { updateSettings } from '../settings/useSettings';
import type { ThemeId } from './tokens';
import { updateBookTheme, useBookTheme } from './useTheme';

const OPTIONS: ThemeId[] = ['system', 'light', 'warm', 'dark'];

/**
 * Theme popover (FR-THM-01): app and page theme. In a book (`documentId`) it sets that book's own theme, warmth
 * (FR-THM-03) and image inversion in Dark (FR-THM-02), leaving other books alone (FR-THM-06); elsewhere, the default.
 * Native radios, slider and checkbox: keyboard and screen-reader behaviour come with them. They are uncontrolled
 * (the content remounts on every open): settings are written asynchronously, and a controlled slider would snap
 * back mid-drag.
 */
export function ThemeMenu({ documentId, triggerRef }: { documentId?: string; triggerRef?: Ref<HTMLButtonElement> }) {
  const { theme, warmth, invertImages } = useBookTheme(documentId);
  const save = (patch: BookTheme) => void (documentId ? updateBookTheme(documentId, patch) : updateSettings(patch));
  const row = 'flex min-h-11 items-center gap-2 rounded px-2 hover:bg-ui-bg';
  return (
    <Popover.Root>
      <Popover.Trigger
        ref={triggerRef}
        aria-label={en.theme.label}
        className="grid min-h-11 min-w-11 place-items-center rounded-md text-ui-fg hover:bg-ui-bg"
      >
        <ThemeIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label={en.theme.label}
          className="z-50 flex w-60 flex-col gap-1 rounded-lg border border-line bg-surface p-2 text-sm text-ui-fg shadow-lg"
        >
          <fieldset className="flex flex-col">
            <legend className="px-2 py-1 text-xs text-muted">{documentId ? en.theme.thisBook : en.theme.label}</legend>
            {OPTIONS.map((id) => (
              <label key={id} className={row}>
                <input
                  type="radio"
                  name="mg-theme"
                  value={id}
                  defaultChecked={theme === id}
                  onChange={() => save({ theme: id })}
                  className="accent-[var(--accent)]"
                />
                {en.theme[id]}
              </label>
            ))}
          </fieldset>
          {documentId && (
            <>
              <label className="flex flex-col gap-1 border-t border-line px-2 pt-2">
                <span className="flex justify-between text-xs text-muted">
                  {en.theme.warmth}
                  <span>{warmth}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={warmth}
                  onChange={(e) => save({ warmth: Number(e.target.value) })}
                  className="min-h-11 accent-[var(--accent)]"
                />
              </label>
              <label className={row}>
                <input
                  type="checkbox"
                  defaultChecked={invertImages}
                  onChange={(e) => save({ invertImages: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                {en.theme.invertImages}
              </label>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
