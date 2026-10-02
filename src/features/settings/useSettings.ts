import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, type Settings } from '../../core/db/models';
import { settingsRepo } from '../../core/db/repos';

// Startup cache of the theme only, to avoid a flash while IndexedDB opens (a trivial UI preference, rule 8).
const THEME_CACHE = 'mg.theme';
const THEMES = ['system', 'light', 'warm', 'dark'] as const;

function cachedTheme(): Settings['theme'] {
  try {
    const v = localStorage.getItem(THEME_CACHE);
    return THEMES.find((t) => t === v) ?? 'system';
  } catch {
    return 'system';
  }
}

export function cacheTheme(theme: Settings['theme']): void {
  try {
    localStorage.setItem(THEME_CACHE, theme);
  } catch {
    /* storage unavailable: only costs a flash at next start */
  }
}

/** Settings live in Dexie (synced as profiles.settings); UI reads them live (rule 3). */
export function useSettings(): Settings {
  return useLiveQuery(() => settingsRepo.get(), []) ?? { ...DEFAULT_SETTINGS, theme: cachedTheme() };
}

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return settingsRepo.update(patch);
}
