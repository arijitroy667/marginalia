import { useState } from 'react';

/** Trivial, device-local UI preference in localStorage (allowed by rule 8; never domain data). */
export function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(`mg.${key}`);
      return allowed.find((a) => a === v) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`mg.${key}`, v);
    } catch {
      /* private mode: preference lasts this session only */
    }
  };
  return [value, set];
}
