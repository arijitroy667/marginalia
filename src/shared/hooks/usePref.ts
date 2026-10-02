import { useCallback, useState } from 'react';

/** Trivial, device-local UI preference in localStorage (allowed by rule 8; never domain data). */
export function usePref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(`mg.${key}`);
      return allowed.find((a) => a === v) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (v: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        try {
          localStorage.setItem(`mg.${key}`, next);
        } catch {
          /* private mode: preference lasts this session only */
        }
        return next;
      }),
    [key],
  );
  return [value, set];
}
