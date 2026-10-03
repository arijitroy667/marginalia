/**
 * JSON export (FR-EXP-02), schema-versioned. Rows as stored locally (camelCase, Zod-validated on write), minus
 * device-only bookkeeping (`localUpdatedAt`). PDFs themselves are not included; `contentHash` identifies each file.
 */
import type { AnnotationRow, DocumentRow, PositionRow, Settings } from '../../core/db/models';

export const EXPORT_SCHEMA = 1;

const strip = <T extends { localUpdatedAt: number }>(row: T): Omit<T, 'localUpdatedAt'> => {
  const { localUpdatedAt, ...rest } = row;
  void localUpdatedAt; // device-only bookkeeping, not part of an export
  return rest;
};

export function exportJson(
  data: { documents: DocumentRow[]; annotations: AnnotationRow[]; positions: PositionRow[]; settings?: Settings },
  exportedAt = new Date(),
): string {
  return JSON.stringify(
    {
      schema: EXPORT_SCHEMA,
      app: 'Marginalia',
      exportedAt: exportedAt.toISOString(),
      ...(data.settings ? { settings: data.settings } : {}),
      documents: data.documents.filter((d) => !d.deletedAt).map(strip),
      annotations: data.annotations.filter((a) => !a.deletedAt).map(strip),
      positions: data.positions.map(strip),
    },
    null,
    2,
  );
}

/** Safe file name from a title: letters, digits, dashes. */
export const fileStem = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'document';
