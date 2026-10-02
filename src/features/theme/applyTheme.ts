import { THEMES, type ResolvedTheme, type ThemeId } from './tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function resolveTheme(id: ThemeId, systemDark: boolean): ResolvedTheme {
  return id === 'system' ? (systemDark ? 'dark' : 'light') : id;
}

/** Writes the theme's tokens as CSS variables on <html> and syncs meta theme-color (FR-THM-01/07). */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  const t = THEMES[theme];
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  for (const [k, v] of Object.entries(t)) if (typeof v === 'string') root.style.setProperty(`--${kebab(k)}`, v);
  for (const [id, hex] of Object.entries(t.highlight)) root.style.setProperty(`--hl-${id}`, hex);
  root.style.setProperty('--hl-alpha', String(t.highlightAlpha));
  root.style.setProperty('--hl-blend', t.highlightBlend);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.uiBg);
}
