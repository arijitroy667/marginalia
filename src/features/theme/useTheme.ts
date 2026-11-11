import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { BookTheme, Settings } from '../../core/db/models';
import { cacheTheme, updateSettings, useSettings } from '../settings/useSettings';
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

/** A book's theme (FR-THM-06): its own choices over the defaults. No book: the defaults (library, settings). */
export function bookTheme(s: Settings, documentId?: string): Required<BookTheme> {
  const own = documentId ? s.bookThemes[documentId] : undefined;
  return {
    theme: own?.theme ?? s.theme,
    warmth: own?.warmth ?? s.warmth,
    invertImages: own?.invertImages ?? s.invertImages,
  };
}

/** Saves a choice for one book only; other books keep theirs (the reader's Theme menu, Shift+T). */
export const updateBookTheme = (documentId: string, patch: BookTheme) =>
  updateSettings((s) => ({ bookThemes: { ...s.bookThemes, [documentId]: { ...s.bookThemes[documentId], ...patch } } }));

/** The book's theme in effect, System resolved through prefers-color-scheme. */
export function useBookTheme(documentId?: string): Required<BookTheme> & { resolved: ResolvedTheme } {
  const t = bookTheme(useSettings(), documentId);
  return { ...t, resolved: resolveTheme(t.theme, useSystemDark()) };
}

/** Applies the theme to the document (app root): the open book's own, else the default; plus the palette. */
export function useTheme(documentId?: string): ResolvedTheme {
  const s = useSettings();
  const resolved = resolveTheme(bookTheme(s, documentId).theme, useSystemDark());
  useLayoutEffect(() => applyTheme(resolved), [resolved]);
  useLayoutEffect(() => applyPalette(s.palette), [s.palette]);
  useLayoutEffect(() => cacheTheme(s.theme), [s.theme]); // the default: what a cold start shows first
  return resolved;
}
