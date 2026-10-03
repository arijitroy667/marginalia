/**
 * Markdown export of one document (FR-EXP-01): grouped by page in reading order; each visual line once as a quote,
 * with its colour meaning and any notes under it (note text is already Markdown); bookmarks listed at the end.
 * Deterministic: no "exported at" time, stable ordering, so the same annotations always give the same file.
 */
import { groupByLine, markerY } from '../../core/anchors/anchor';
import type { AnnotationRow, DocumentRow, PaletteEntry } from '../../core/db/models';

const order = (a: AnnotationRow, b: AnnotationRow) =>
  a.page - b.page ||
  markerY(a.anchor) - markerY(b.anchor) ||
  (a.anchor.rects[0]?.x ?? 0) - (b.anchor.rects[0]?.x ?? 0) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export function exportMarkdown(
  doc: Pick<DocumentRow, 'title' | 'author'>,
  annotations: AnnotationRow[],
  palette: readonly PaletteEntry[],
): string {
  const live = annotations.filter((a) => !a.deletedAt).sort(order);
  const label = (id: number | null) => palette.find((p) => p.id === id)?.label ?? (id ? `Colour ${id}` : '');
  const out: string[] = [`# ${oneLine(doc.title)}`];
  if (doc.author) out.push('', `*${oneLine(doc.author)}*`);

  const pages = [...new Set(live.filter((a) => a.kind !== 'bookmark').map((a) => a.page))];
  for (const page of pages) {
    out.push('', `## Page ${page}`);
    const onPage = live.filter((a) => a.page === page && a.kind !== 'bookmark');
    for (const line of groupByLine(onPage, (a) => a.anchor)) {
      const text = line.map((a) => a.anchor.quote.exact).find((q) => q) ?? '';
      const colours = [...new Set(line.filter((a) => a.kind === 'highlight').map((a) => label(a.colorId)))];
      out.push('');
      if (text) out.push(quote(text));
      if (colours.length) out.push(`${text ? '\n' : ''}*${colours.join(', ')}*`);
      for (const n of line.filter((a) => a.kind === 'note' && a.body)) out.push('', n.body!.trim());
    }
  }

  const bookmarks = live.filter((a) => a.kind === 'bookmark');
  if (bookmarks.length) {
    out.push('', '## Bookmarks', '');
    for (const b of bookmarks)
      out.push(`- p. ${b.page} — ${oneLine(b.label ?? b.anchor.quote.exact) || `Page ${b.page}`}`);
  }
  return `${out.join('\n')}\n`;
}
