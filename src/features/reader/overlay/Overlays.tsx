import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import type { AnnotationRow } from '../../../core/db/models';
import { db } from '../../../core/db/schema';
import { en } from '../../../shared/i18n/en';
import { getPageLines } from '../lines/pageLines';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import type { Viewer } from '../pdf/viewer';
import { useReaderStore } from '../store';
import { BookmarkMarker } from './BookmarkMarker';
import { usePageHosts } from './hosts';
import { LineToolbar } from './LineToolbar';
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
  toolbar: ReactNode;
}

/** Overlay manager (T-202/T-203): one portal pair per rendered page; annotations render from stored rects (rule 6). */
export function Overlays({ ready, getViewer, container, pdf, documentId, docHash, rotation, toolbar }: Props) {
  const hosts = usePageHosts(ready, getViewer);
  const hover = useHoverBand(ready, getViewer, container, pdf, docHash);
  const selection = useReaderStore((s) => s.selection);
  const flash = useReaderStore((s) => s.flash);
  const resume = useReaderStore((s) => s.resume);
  const [textless, setTextless] = useState<ReadonlySet<number>>(new Set());
  const annotations = useLiveQuery(
    () => db.annotations.where('documentId').equals(documentId).filter((a) => a.deletedAt === null).toArray(),
    [documentId],
  );
  const byPage = useMemo(() => {
    const m = new Map<string, AnnotationRow[]>();
    for (const a of annotations ?? []) m.set(`${a.kind}:${a.page}`, [...(m.get(`${a.kind}:${a.page}`) ?? []), a]);
    return m;
  }, [annotations]);

  // pages without a text layer get a banner and no line features (FR-LIN-06)
  useEffect(() => {
    let alive = true;
    for (const page of hosts.keys())
      void getPageLines(pdf, docHash, page).then((pl) => {
        if (alive && pl && !pl.hasTextLayer) setTextless((s) => (s.has(page) ? s : new Set(s).add(page)));
      });
    return () => {
      alive = false;
    };
  }, [hosts, pdf, docHash]);

  return [...hosts].map(([page, h]) => (
    <PageLayers
      key={page}
      hosts={h}
      rotation={rotation}
      highlights={byPage.get(`highlight:${page}`) ?? []}
      hover={hover?.page === page && selection?.page !== page ? hover.band : undefined}
      selected={selection?.page === page ? selection.anchor.rects : undefined}
      flash={flash?.page === page ? flash : undefined}
      resume={resume?.anchor.page === page ? resume.anchor : undefined}
      markers={(byPage.get(`bookmark:${page}`) ?? []).map((b) => ({ key: b.id, anchor: b.anchor, node: <BookmarkMarker row={b} /> }))}
      banner={textless.has(page) ? en.reader.noTextLayer : undefined}
    />
  )).concat(
    selection && hosts.get(selection.page) ? (
      <LineToolbar key="toolbar" host={hosts.get(selection.page)!.over} rotation={rotation} selection={selection}>
        {toolbar}
      </LineToolbar>
    ) : [],
  );
}
