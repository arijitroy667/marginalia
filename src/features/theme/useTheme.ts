import { useLayoutEffect, useSyncExternalStore } from 'react';
import { cacheTheme, useSettings } from '../settings/useSettings';
import { applyPalette, applyTheme, resolveTheme } from './applyTheme';
import type { ResolvedTheme } from './tokens';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = query();
      q.addEventListener('change', onChange);
      return () => q.removeEventListener('change', onChange);
    },
    () => query().matches,
  );
}

/** Resolves the user's theme (System follows prefers-color-scheme) and applies it, plus the highlight palette. */
export function useTheme(): ResolvedTheme {
  const { theme, palette } = useSettings();
  const resolved = resolveTheme(theme, useSystemDark());
  useLayoutEffect(() => applyTheme(resolved), [resolved]);
  useLayoutEffect(() => applyPalette(palette), [palette]);
  useLayoutEffect(() => cacheTheme(theme), [theme]);
  return resolved;
}
