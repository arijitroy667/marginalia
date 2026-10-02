/**
 * PDF.js PDFViewer wiring (PRD §8.4): virtualised continuous scroll, text layer, link layer, find
 * controller. Public API only (rule 9). Canvas caps per ADR 0003.
 */
import type { PDFPageView } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { pdfjs, type PDFDocumentProxy } from './pdfjs';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export type Viewer = Awaited<ReturnType<typeof createViewer>>;
export type PdfViewer = Viewer['viewer'];

/** PDF.js types getPageView() as any; this is the one typed accessor (0-based index). */
export const pageViewAt = (v: PdfViewer, index: number): PDFPageView | undefined => v.getPageView(index) as PDFPageView | undefined;

/** `fingerprint` keys browser-history entries to this document: our SHA-256, not PDF.js's weak one (FR-LIB-02). */
export async function createViewer(container: HTMLDivElement, doc: PDFDocumentProxy, fingerprint: string) {
  // imported after pdfjs.ts has set globalThis.pdfjsLib
  const { EventBus, LinkTarget, PDFFindController, PDFHistory, PDFLinkService, PDFViewer } = await import('pdfjs-dist/web/pdf_viewer.mjs');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer' });
  const findController = new PDFFindController({ eventBus, linkService });
  const viewer = new PDFViewer({
    container,
    eventBus,
    linkService,
    findController,
    textLayerMode: 1, // selectable text (FR-RDR-07)
    annotationMode: pdfjs.AnnotationMode.ENABLE, // links, no forms (forms are P2, FR-RDR-13)
    maxCanvasPixels: coarse ? 8_388_608 : 16_777_216, // NFR-PERF-04
    imagesRightClickMinSize: 32, // image rects for the dark-theme image restore (ADR 0002)
  });
  linkService.setViewer(viewer);
  // internal link jumps push browser-history entries; Back returns to the prior position (FR-RDR-08)
  const pdfHistory = new PDFHistory({ linkService, eventBus });
  linkService.setHistory(pdfHistory);
  eventBus.on('pagesinit', () => pdfHistory.initialize({ fingerprint, updateUrl: false }));
  viewer.setDocument(doc);
  linkService.setDocument(doc, null);
  findController.setDocument(doc);
  return {
    viewer,
    eventBus,
    linkService,
    findController,
    destroy() {
      pdfHistory.reset();
      findController.setDocument(null as unknown as PDFDocumentProxy);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      linkService.setDocument(null, null);
    },
  };
}
