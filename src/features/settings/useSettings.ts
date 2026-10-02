import { useSyncExternalStore } from 'react';
import type { ThemeId } from '../theme/tokens';

export interface Settings {
  theme: ThemeId;
}
export const DEFAULT_SETTINGS: Settings = { theme: 'system' };

// ponytail: in-memory until T-104 moves settings into Dexie (synced via profiles.settings in T-306)
let current = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}
