/** Case- and accent-insensitive form for client-side search (é -> e, ß -> ss, ligatures split). */
export const searchKey = (s: string): string =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "yesterday", "3 weeks ago", "just now"-style relative time for an ISO timestamp. */
export function relativeTime(iso: string, now = Date.now()): string {
  const secs = (Date.parse(iso) - now) / 1000;
  for (const [unit, size] of UNITS) if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  return rtf.format(0, 'minute');
}
