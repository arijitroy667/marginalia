import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('note Markdown (FR-NOT-05, NFR-SEC-05)', () => {
  it('parses bold, italic, code and links', () => {
    expect(parseInline('a **b** *c* _d_ `e` [f](https://x.org)')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'd' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'e' },
      { t: 'text', v: ' ' },
      { t: 'link', href: 'https://x.org', c: [{ t: 'text', v: 'f' }] },
    ]);
  });

  it('keeps raw HTML, unsafe links and intraword underscores as plain text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ t: 'text', v: '<script>alert(1)</script>' }]);
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: '[x](javascript:alert(1))' }]);
    expect(parseInline('[x](data:text/html,hi)')).toEqual([{ t: 'text', v: '[x](data:text/html,hi)' }]);
    expect(parseInline('snake_case_name')).toEqual([{ t: 'text', v: 'snake_case_name' }]);
    expect(parseInline('a * b * c')).toEqual([{ t: 'text', v: 'a * b * c' }]);
  });

  it('parses paragraphs, lists and code blocks', () => {
    expect(parseMarkdown('First line\nsecond\n\n- one\n- **two**\n\n1. a\n2. b\n\n```\n<b>raw</b>\n```')).toEqual([
      { t: 'p', c: [{ t: 'text', v: 'First line\nsecond' }] },
      { t: 'ul', items: [[{ t: 'text', v: 'one' }], [{ t: 'strong', c: [{ t: 'text', v: 'two' }] }]] },
      { t: 'ol', items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }]] },
      { t: 'pre', v: '<b>raw</b>' },
    ]);
    expect(parseMarkdown('')).toEqual([]);
  });
});
