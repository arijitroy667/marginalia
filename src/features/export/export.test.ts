import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, type AnnotationRow, type DocumentRow } from '../../core/db/models';
import { exportJson, fileStem } from './exportJson';
import { exportMarkdown } from './exportMarkdown';

const t = '2026-10-03T10:00:00.000Z';
let n = 0;
const ann = (over: Partial<AnnotationRow>): AnnotationRow => {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    documentId: 'd',
    kind: 'highlight',
    page: 1,
    anchor: {
      v: 1,
      page: over.page ?? 1,
      rects: [{ x: 0.1, y: 0.2, w: 0.8, h: 0.02 }],
      quote: { exact: 'A line of text', prefix: '', suffix: '' },
    },
    colorId: 1,
    body: null,
    label: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    localUpdatedAt: 0,
    ...over,
  };
};
const at = (page: number, y: number, exact: string) => ({
  v: 1 as const,
  page,
  rects: [{ x: 0.1, y, w: 0.8, h: 0.02 }],
  quote: { exact, prefix: '', suffix: '' },
});

const annotations = [
  ann({ page: 3, anchor: at(3, 0.5, 'Later on page three'), colorId: 4 }),
  ann({ page: 1, anchor: at(1, 0.2, 'The first line'), colorId: 1 }),
  ann({
    page: 1,
    kind: 'note',
    colorId: null,
    anchor: at(1, 0.201, 'The first line'),
    body: 'Why **slowly**?\n- check ch. 2',
  }),
  ann({ page: 1, anchor: at(1, 0.6, 'Second highlight'), colorId: 2 }),
  ann({ page: 2, kind: 'bookmark', colorId: null, anchor: at(2, 0.1, 'Chapter Two'), label: 'Start of chapter 2' }),
  ann({ page: 1, anchor: at(1, 0.3, 'Deleted one'), deletedAt: t }),
];

describe('Markdown export (FR-EXP-01)', () => {
  it('groups by page in reading order: quote once per line, colour meaning, notes under it, bookmarks at the end', () => {
    expect(exportMarkdown({ title: 'On Reading', author: 'A. Reader' }, annotations, DEFAULT_PALETTE))
      .toMatchInlineSnapshot(`
      "# On Reading

      *A. Reader*

      ## Page 1

      > The first line

      *Key idea*

      Why **slowly**?
      - check ch. 2

      > Second highlight

      *Definition*

      ## Page 3

      > Later on page three

      *Disagree / doubt*

      ## Bookmarks

      - p. 2 — Start of chapter 2
      "
    `);
  });

  it('is deterministic: input order does not change the output', () => {
    const a = exportMarkdown({ title: 'X', author: null }, annotations, DEFAULT_PALETTE);
    const b = exportMarkdown({ title: 'X', author: null }, [...annotations].reverse(), DEFAULT_PALETTE);
    expect(b).toBe(a);
  });

  it('page-level marks (scanned pages, empty quote) still export', () => {
    const md = exportMarkdown(
      { title: 'Scan', author: null },
      [ann({ page: 4, anchor: at(4, 0, ''), colorId: 3 })],
      DEFAULT_PALETTE,
    );
    expect(md).toContain('## Page 4\n\n*Look up*');
  });
});

describe('JSON export (FR-EXP-02)', () => {
  it('is schema-versioned, drops tombstones and device bookkeeping', () => {
    const doc = { id: 'd', localUpdatedAt: 5, deletedAt: null, title: 'X' } as unknown as DocumentRow;
    const json = JSON.parse(exportJson({ documents: [doc], annotations, positions: [] }, new Date(t))) as Record<
      string,
      unknown
    > & {
      annotations: object[];
      documents: object[];
    };
    expect(json).toMatchObject({ schema: 1, app: 'Marginalia', exportedAt: t });
    expect(json.annotations).toHaveLength(5);
    expect(json.documents[0]).not.toHaveProperty('localUpdatedAt');
  });

  it('makes safe file names', () => {
    expect(fileStem('Deep Learning: Ch. 2 / Notes')).toBe('deep-learning-ch-2-notes');
    expect(fileStem('???')).toBe('document');
  });
});
