import { describe, expect, it } from 'vitest';
import type { AnnotationRow, DocumentRow } from '../../core/db/models';
import { searchAnnotations } from './searchAnnotations';

const doc = (id: string, title: string, deletedAt: string | null = null) => ({ id, title, deletedAt }) as DocumentRow;
const ann = (id: string, documentId: string, page: number, over: Partial<AnnotationRow>): AnnotationRow =>
  ({
    id,
    documentId,
    kind: 'highlight',
    page,
    anchor: { v: 1, page, rects: [{ x: 0, y: 0.5, w: 1, h: 0.02 }], quote: { exact: '', prefix: '', suffix: '' } },
    colorId: 1,
    body: null,
    label: null,
    deletedAt: null,
    ...over,
  }) as AnnotationRow;
const quote = (exact: string) => ({
  v: 1 as const,
  page: 1,
  rects: [{ x: 0, y: 0.5, w: 1, h: 0.02 }],
  quote: { exact, prefix: '', suffix: '' },
});

const docs = [doc('b', 'Zettelkasten'), doc('a', 'Attention'), doc('gone', 'Deleted book', '2026-10-03T00:00:00Z')];
const anns = [
  ann('1', 'b', 4, { anchor: quote('The slip box is a second brain for slow reading') }),
  ann('2', 'a', 9, { kind: 'note', colorId: null, body: 'Compare with Café culture and SLOW food' }),
  ann('3', 'a', 2, { kind: 'bookmark', colorId: null, label: 'Slowness chapter' }),
  ann('4', 'gone', 1, { anchor: quote('slow but deleted') }),
  ann('5', 'a', 1, { anchor: quote('slow, removed'), deletedAt: '2026-10-03T00:00:00Z' }),
];

describe('library-wide annotation search (FR-PNL-02)', () => {
  it('searches quotes, notes and labels case-insensitively; skips deleted rows and books; orders by book and page', () => {
    const hits = searchAnnotations(docs, anns, 'slow');
    expect(hits.map((h) => [h.document.title, h.annotation.page])).toEqual([
      ['Attention', 2],
      ['Attention', 9],
      ['Zettelkasten', 4],
    ]);
    expect(hits[1]).toMatchObject({ before: 'Compare with Café culture and ', match: 'SLOW', after: ' food' });
  });

  it('is accent-insensitive and needs two characters', () => {
    expect(searchAnnotations(docs, anns, 'cafe').map((h) => h.annotation.id)).toEqual(['2']);
    expect(searchAnnotations(docs, anns, 's')).toEqual([]);
  });

  it('trims long text around the match', () => {
    const long = 'x'.repeat(100) + ' needle ' + 'y'.repeat(100);
    const [h] = searchAnnotations(docs, [ann('9', 'a', 1, { anchor: quote(long) })], 'needle');
    expect(h!.before.startsWith('…')).toBe(true);
    expect(h!.after.endsWith('…')).toBe(true);
    expect(h!.match).toBe('needle');
  });
});
