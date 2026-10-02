import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, type RefObject } from 'react';
import type { AnnotationRow } from '../../../core/db/models';
import { db } from '../../../core/db/schema';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import type { Viewer } from '../pdf/viewer';
import { usePageHosts } from './hosts';
import { PageLayers } from './PageLayers';
import { useHoverBand } from './useHoverBand';

interface Props {
  ready: boolean;
  getViewer: () => Viewer | null;
  container: RefObject<HTMLDivElement | null>;
  pdf: PDFDocumentProxy;
  documentId: string;
  docHash: string;
  rotation: number;
}

/** Overlay manager (T-202): one portal pair per rendered page; annotations render from stored rects (rule 6). */
export function Overlays({ ready, getViewer, container, pdf, documentId, docHash, rotation }: Props) {
  const hosts = usePageHosts(ready, getViewer);
  const hover = useHoverBand(ready, getViewer, container, pdf, docHash);
  const annotations = useLiveQuery(
    () => db.annotations.where('documentId').equals(documentId).filter((a) => a.deletedAt === null).toArray(),
    [documentId],
  );
  const highlightsByPage = useMemo(() => {
    const m = new Map<number, AnnotationRow[]>();
    for (const a of annotations ?? []) if (a.kind === 'highlight') m.set(a.page, [...(m.get(a.page) ?? []), a]);
    return m;
  }, [annotations]);

  return [...hosts].map(([page, h]) => (
    <PageLayers key={page} hosts={h} rotation={rotation} highlights={highlightsByPage.get(page) ?? []} hover={hover?.page === page ? hover.band : undefined} />
  ));
}
