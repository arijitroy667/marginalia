/**
 * Library-wide annotation search (FR-PNL-02), client-side over IndexedDB rows: quotes, note text and bookmark
 * labels; case- and accent-insensitive. Results in library order (book, then page and position) with a snippet.
 */
import { markerY } from '../../core/anchors/anchor';
import type { AnnotationRow, DocumentRow } from '../../core/db/models';
import { searchKey } from '../../shared/utils/text';

export interface AnnotationHit {
  annotation: AnnotationRow;
  document: DocumentRow;
  /** Snippet split around the match for highlighting; `match` is empty when only an accent-folded match was found. */
  before: string;
  match: string;
  after: string;
}

const CONTEXT = 40;

function snippet(text: string, q: string): Pick<AnnotationHit, 'before' | 'match' | 'after'> {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (at < 0)
    return { before: '', match: '', after: flat.slice(0, 2 * CONTEXT) + (flat.length > 2 * CONTEXT ? '…' : '') };
  const start = Math.max(0, at - CONTEXT);
  const end = Math.min(flat.length, at + q.length + CONTEXT);
  return {
    before: (start > 0 ? '…' : '') + flat.slice(start, at),
    match: flat.slice(at, at + q.length),
    after: flat.slice(at + q.length, end) + (end < flat.length ? '…' : ''),
  };
}

export function searchAnnotations(
  documents: DocumentRow[],
  annotations: AnnotationRow[],
  query: string,
  limit = 50,
): AnnotationHit[] {
  const q = query.trim();
  const key = searchKey(q);
  if (key.length < 2) return [];
  const docs = new Map(documents.filter((d) => !d.deletedAt).map((d) => [d.id, d]));
  const hits: AnnotationHit[] = [];
  for (const a of annotations) {
    const document = docs.get(a.documentId);
    if (!document || a.deletedAt) continue;
    const text = [a.body, a.label, a.anchor.quote.exact].find((t) => t && searchKey(t).includes(key));
    if (text) hits.push({ annotation: a, document, ...snippet(text, q) });
  }
  return hits
    .sort(
      (x, y) =>
        x.document.title.localeCompare(y.document.title) ||
        x.annotation.page - y.annotation.page ||
        markerY(x.annotation.anchor) - markerY(y.annotation.anchor),
    )
    .slice(0, limit);
}
