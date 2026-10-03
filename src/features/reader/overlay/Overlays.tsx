import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { groupByLine, intersects } from '../../../core/anchors/anchor';
import type { AnnotationRow } from '../../../core/db/models';
import { annotationsRepo } from '../../../core/db/repos';
import { en } from '../../../shared/i18n/en';
import { useSettings } from '../../settings/useSettings';
import { getPageLines } from '../lines/pageLines';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import { pageViewAt, type Viewer } from '../pdf/viewer';
import { useReaderStore } from '../store';
import { BookmarkMarker } from './BookmarkMarker';
import { usePageHosts } from './hosts';
import { LineToolbar } from './LineToolbar';
import { NoteMarker } from './NoteMarker';
import { NotePopover } from './NotePopover';
import { PageLayers, type Marker } from './PageLayers';
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

const NONE: AnnotationRow[] = []; // stable: memoised page layers skip pages whose props did not change

interface PageAnnotations {
  highlights: AnnotationRow[];
  noted: Set<string>;
  markers: Marker[];
}

/** Overlay manager (T-202..T-207): one portal pair per rendered page; annotations render from stored rects (rule 6). */
export function Overlays({ ready, getViewer, container, pdf, documentId, docHash, rotation, toolbar }: Props) {
  const hosts = usePageHosts(ready, getViewer);
  const hover = useHoverBand(ready, getViewer, container, pdf, docHash);
  const selection = useReaderStore((s) => s.selection);
  const flash = useReaderStore((s) => s.flash);
  const resume = useReaderStore((s) => s.resume);
  const notes = useReaderStore((s) => s.notes);
  const region = useReaderStore((s) => s.region);
  const hidden = useReaderStore((s) => s.hidden);
  const { gutterStyle } = useSettings();
  const [textless, setTextless] = useState<ReadonlySet<number>>(new Set());
  const annotations = useLiveQuery(() => annotationsRepo.ofDocument(documentId), [documentId]);

  const byPage = useMemo(() => {
    const rows = new Map<number, AnnotationRow[]>();
    for (const a of annotations ?? []) rows.set(a.page, [...(rows.get(a.page) ?? []), a]);
    const out = new Map<number, PageAnnotations>();
    for (const [page, list] of rows) {
      const highlights = list.filter((a) => a.kind === 'highlight');
      const pageNotes = list.filter((a) => a.kind === 'note');
      const markers: Marker[] = list
        .filter((a) => a.kind === 'bookmark')
        .map((b) => ({ key: b.id, anchor: b.anchor, node: <BookmarkMarker row={b} /> }));
      for (const group of groupByLine(pageNotes, (n) => n.anchor)) {
        const first = group[0]!;
        const tint = highlights.find((h) => intersects(h.anchor, first.anchor))?.colorId ?? null; // FR-NOT-02
        markers.push({
          key: `note:${first.id}`,
          anchor: first.anchor,
          node: (
            <NoteMarker
              notes={group}
              tint={tint}
              look={gutterStyle}
              onOpen={() => useReaderStore.getState().openNotes(first.anchor, group)}
            />
          ),
        });
      }
      const noted = new Set(
        highlights.filter((h) => pageNotes.some((n) => intersects(h.anchor, n.anchor))).map((h) => h.id),
      );
      // colours hidden in the document still tint notes and show in the panel (FR-HLT-06)
      out.set(page, { highlights: highlights.filter((h) => !hidden.includes(h.colorId ?? 0)), noted, markers });
    }
    return out;
  }, [annotations, gutterStyle, hidden]);

  // Each page's lines are prepared in idle time once its text layer is up: the first tap on the page then answers
  // at once, and pages without text get their banner (FR-LIN-06). Idle, not immediately: extracting text for every
  // page as it scrolls into view competed with rendering (T-403).
  useEffect(() => {
    const v = getViewer();
    if (!ready || !v) return;
    let alive = true;
    const idle = (fn: () => void) =>
      'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200);
    const warm = ({ pageNumber }: { pageNumber: number }) =>
      idle(
        () =>
          void getPageLines(pdf, docHash, pageNumber).then((pl) => {
            if (alive && pl && !pl.hasTextLayer)
              setTextless((cur) => (cur.has(pageNumber) ? cur : new Set(cur).add(pageNumber)));
          }),
      );
    v.eventBus.on('textlayerrendered', warm);
    for (let i = 0; i < v.viewer.pagesCount; i++)
      if (pageViewAt(v.viewer, i)?.div.querySelector(':scope > .canvasWrapper')) warm({ pageNumber: i + 1 }); // rendered before we subscribed
    return () => {
      alive = false;
      v.eventBus.off('textlayerrendered', warm);
    };
  }, [ready, getViewer, pdf, docHash]);

  const focus = selection ?? (notes && { page: notes.anchor.page, anchor: notes.anchor }); // band under the line being annotated
  const noteHost = notes && hosts.get(notes.anchor.page);
  return (
    <>
      {[...hosts].map(([page, h]) => {
        const a = byPage.get(page);
        return (
          <PageLayers
            key={page}
            hosts={h}
            rotation={rotation}
            highlights={a?.highlights ?? NONE}
            noted={a?.noted}
            hover={hover?.page === page && focus?.page !== page ? hover.band : undefined}
            selected={region?.page === page ? [region.rect] : focus?.page === page ? focus.anchor.rects : undefined}
            flash={flash?.page === page ? flash : undefined}
            resume={resume?.anchor.page === page ? resume.anchor : undefined}
            markers={a?.markers}
            banner={textless.has(page) ? en.reader.noTextLayer : undefined}
          />
        );
      })}
      {selection && hosts.get(selection.page) && (
        <LineToolbar host={hosts.get(selection.page)!.over} rotation={rotation} selection={selection}>
          {toolbar}
        </LineToolbar>
      )}
      {notes && noteHost && (
        <NotePopover key={notes.id} host={noteHost.over} rotation={rotation} documentId={documentId} editor={notes} />
      )}
    </>
  );
}
