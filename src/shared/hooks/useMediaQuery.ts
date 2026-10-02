import { useSyncExternalStore } from 'react';

/** Live CSS media query match (layout decisions that CSS alone cannot make). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
