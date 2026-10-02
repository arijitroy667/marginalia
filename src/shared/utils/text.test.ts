import { describe, expect, it } from 'vitest';
import { relativeTime, searchKey } from './text';

describe('searchKey', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(searchKey('  Ćafé  Società ')).toBe('cafe societa');
    expect(searchKey('ﬁnal Draft')).toBe('final draft');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  it('formats past times in the largest whole unit', () => {
    expect(relativeTime('2026-10-01T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-09-18T12:00:00Z', now)).toBe('2 weeks ago');
    expect(relativeTime('2026-10-02T11:59:30Z', now)).toBe('this minute');
  });
});
