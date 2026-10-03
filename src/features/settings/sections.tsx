import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { PALETTE_MAX, ZOOM_DEFAULTS } from '../../config';
import type { PaletteEntry, Settings } from '../../core/db/models';
import { cacheBudget } from '../../core/db/repos';
import { usePref } from '../../shared/hooks/usePref';
import { en } from '../../shared/i18n/en';
import { toast } from '../../shared/ui/toast';
import { applyOverrides, REMAPPABLE, validateRemap, type Action } from '../reader/keymap';
import { highlightContrast, type ResolvedTheme, type ThemeId } from '../theme/tokens';
import { updateSettings, useSettings } from './useSettings';

export const card = 'flex flex-col gap-3 rounded-lg border border-line bg-surface p-4';
const field = 'min-h-11 rounded-md border border-line-strong bg-ui-bg px-2 text-ui-fg';
const btn = 'min-h-11 rounded-md border border-line-strong px-3 text-sm';
const save = (patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)) =>
  void updateSettings(patch).catch(() => toast(en.reader.saveFailed));

function Choice<T extends string>({
  legend,
  value,
  options,
  label,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((o) => (
          <label key={o} className="flex min-h-11 items-center gap-2">
            <input type="radio" checked={value === o} onChange={() => onChange(o)} className="accent-[var(--accent)]" />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Reading defaults (FR-SET-01/02): synced theme, warmth, image inversion, note marker; device-local zoom. */
export function ReadingSection() {
  const s = useSettings();
  const [zoom, setZoom] = usePref('reader.zoom', ZOOM_DEFAULTS, 'page-width');
  const themes: ThemeId[] = ['system', 'light', 'warm', 'dark'];
  return (
    <section aria-labelledby="set-reading" className={card}>
      <h2 id="set-reading" className="font-medium">
        {en.settings.reading}
      </h2>
      <Choice
        legend={en.theme.label}
        value={s.theme}
        options={themes}
        label={(t) => en.theme[t]}
        onChange={(theme) => save({ theme })}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          {en.theme.warmth} · {s.warmth}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={s.warmth}
          onChange={(e) => save({ warmth: Number(e.target.value) })}
          className="min-h-11 accent-[var(--accent)]"
        />
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={s.invertImages}
          onChange={(e) => save({ invertImages: e.target.checked })}
          className="accent-[var(--accent)]"
        />
        {en.theme.invertImages}
      </label>
      <Choice
        legend={en.settings.noteMarker}
        value={s.gutterStyle}
        options={['bubble', 'dot'] as const}
        label={(g) => en.settings.gutter[g]}
        onChange={(gutterStyle) => save({ gutterStyle })}
      />
      <Choice
        legend={en.settings.defaultZoom}
        value={zoom}
        options={ZOOM_DEFAULTS}
        label={(z) => en.settings.zoom[z]}
        onChange={setZoom}
      />
    </section>
  );
}

const THEME_ORDER: ResolvedTheme[] = ['light', 'warm', 'dark'];

/** Highlight colours and their meanings (FR-HLT-02, FR-SET-01), with the contrast check (FR-THM-05). */
export function PaletteSection() {
  const { palette } = useSettings();
  // every edit applies to the latest stored palette, so quick successive edits never undo each other
  const change = (fn: (p: PaletteEntry[]) => PaletteEntry[]) => save((cur) => ({ palette: fn(cur.palette) }));
  const update = (id: number, patch: Partial<PaletteEntry>) =>
    change((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (entry: PaletteEntry) => {
    let at = 0;
    change((ps) => ((at = ps.findIndex((p) => p.id === entry.id)), ps.filter((p) => p.id !== entry.id)));
    const restore = () =>
      change((ps) => (ps.some((p) => p.id === entry.id) ? ps : [...ps.slice(0, at), entry, ...ps.slice(at)]));
    toast(en.settings.colourRemoved(entry.label), { label: en.common.undo, run: restore });
  };
  const add = () =>
    change((ps) => {
      const id = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !ps.some((p) => p.id === n));
      return id ? [...ps, { id, hex: '#FFB870', label: en.settings.newColour }] : ps; // orange: readable in every theme
    });
  return (
    <section aria-labelledby="set-palette" className={card}>
      <h2 id="set-palette" className="font-medium">
        {en.settings.palette}
      </h2>
      <p className="text-sm text-muted">{en.settings.paletteHint}</p>
      <ul className="flex flex-col gap-2">
        {palette.map((p, i) => {
          const weak = THEME_ORDER.filter((t) => highlightContrast(t, p.hex) < 4.5);
          return (
            <li key={p.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm text-muted" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  type="color"
                  value={p.hex.toLowerCase()}
                  aria-label={en.settings.colourOf(p.label)}
                  onChange={(e) => update(p.id, { hex: e.target.value.toUpperCase() })}
                  className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-line-strong bg-ui-bg"
                />
                <input
                  key={p.label} // re-render with the stored value once settings load (uncontrolled field)
                  aria-label={en.settings.meaningOf(i + 1)}
                  defaultValue={p.label}
                  maxLength={24}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (label && label !== p.label) update(p.id, { label });
                    else e.target.value = p.label;
                  }}
                  className={`${field} min-w-0 flex-1`}
                />
                <button
                  className={btn}
                  disabled={palette.length <= 1}
                  onClick={() => remove(p)}
                  aria-label={en.settings.removeColour(p.label)}
                >
                  ✕
                </button>
              </div>
              {weak.length > 0 && (
                <p role="status" className="pl-7 text-xs text-accent">
                  {en.settings.lowContrast(weak.map((t) => en.theme[t]).join(', '))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {palette.length < PALETTE_MAX && (
        <button className={`${btn} self-start`} onClick={add}>
          {en.settings.addColour}
        </button>
      )}
    </section>
  );
}

/** Shortcut remapping (FR-KEY-04, FR-BKM-06): press a key to assign it; refused keys say why. */
export function ShortcutsSection() {
  const { keymap: overrides } = useSettings();
  const [capturing, setCapturing] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ action: Action; text: string } | null>(null);
  const keymap = applyOverrides(overrides);
  const keyOf = (a: Action) => keymap.find((b) => b.action === a)?.keys[0] ?? '';

  const capture = (action: Action, e: React.KeyboardEvent) => {
    if (e.key === 'Tab') return; // keep keyboard navigation working
    e.preventDefault();
    if (e.key === 'Escape') return setCapturing(null);
    const r = validateRemap(e, action, keymap);
    if ('error' in r) {
      const err = r.error;
      return setMessage({
        action,
        text:
          err.kind === 'conflict'
            ? en.settings.remapConflict(en.keys.actions[err.with])
            : en.settings.remapErrors[err.kind],
      });
    }
    setMessage(null);
    setCapturing(null);
    save((cur) => ({ keymap: { ...cur.keymap, [action]: r.key } }));
  };

  return (
    <section aria-labelledby="set-keys" className={card}>
      <h2 id="set-keys" className="font-medium">
        {en.settings.shortcuts}
      </h2>
      <p className="text-sm text-muted">{en.settings.shortcutsHint}</p>
      <ul className="flex flex-col divide-y divide-line">
        {REMAPPABLE.map((a) => (
          <li key={a} className="flex flex-wrap items-center gap-2 py-1">
            <span className="flex-1 text-sm">{en.keys.actions[a]}</span>
            <button
              className={`${btn} min-w-24 font-mono ${capturing === a ? 'border-accent text-accent' : ''}`}
              aria-label={en.settings.remapLabel(en.keys.actions[a], keyOf(a).toUpperCase())}
              onClick={() => setCapturing(capturing === a ? null : a)}
              onKeyDown={(e) => capturing === a && capture(a, e)}
              onBlur={() => capturing === a && setCapturing(null)}
            >
              {capturing === a ? en.settings.pressKey : keyOf(a).toUpperCase()}
            </button>
            {message?.action === a && (
              <p role="alert" className="w-full text-xs text-accent">
                {message.text}
              </p>
            )}
          </li>
        ))}
      </ul>
      <button
        className={`${btn} self-start`}
        disabled={Object.keys(overrides).length === 0}
        onClick={() => save({ keymap: {} })}
      >
        {en.settings.resetShortcuts}
      </button>
    </section>
  );
}

/** Offline cache budget for this device (FR-SET-02). */
export function CacheBudget() {
  const budget = useLiveQuery(() => cacheBudget.get(), []);
  if (!budget) return null;
  const select = (
    label: string,
    value: number,
    options: number[],
    show: (n: number) => ReactNode,
    patch: (n: number) => { docs: number; mb: number },
  ) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="min-w-28">{label}</span>
      <select value={value} onChange={(e) => void cacheBudget.set(patch(Number(e.target.value)))} className={field}>
        {options.map((o) => (
          <option key={o} value={o}>
            {show(o)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{en.settings.cacheBudget}</p>
      {select(
        en.settings.cacheBooks,
        budget.docs,
        [3, 5, 10, 20],
        (n) => n,
        (docs) => ({ ...budget, docs }),
      )}
      {select(
        en.settings.cacheSize,
        budget.mb,
        [250, 500, 1000, 2000],
        (n) => (n >= 1000 ? `${n / 1000} GB` : `${n} MB`),
        (mb) => ({ ...budget, mb }),
      )}
      <p className="text-xs text-muted">{en.settings.cacheHint}</p>
    </div>
  );
}
