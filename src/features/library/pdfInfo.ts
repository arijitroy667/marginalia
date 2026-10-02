import type { PDFDocumentProxy } from '../reader/pdf/pdfjs';

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Title (PDF metadata, else file name), author, page count (FR-LIB-03). */
export async function readPdfInfo(doc: PDFDocumentProxy, fileName: string) {
  const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as Record<string, unknown>;
  const meta = clean(info.Title);
  const fromName = fileName.replace(/\.pdf$/i, '').trim();
  return {
    title: ((meta && !/^untitled$/i.test(meta) ? meta : fromName) || 'Untitled').slice(0, 500),
    author: clean(info.Author).slice(0, 500) || null,
    pageCount: doc.numPages,
  };
}

/**
 * First-page cover: <= 320 px wide, <= 40 KB (FR-LIB-03). WebP when the browser can encode it,
 * else JPEG (Safari has no WebP encoder).
 */
export async function renderCover(doc: PDFDocumentProxy, width = 320, maxBytes = 40 * 1024): Promise<Blob | null> {
  const page = await doc.getPage(1);
  const unit = page.getViewport({ scale: 1 });
  const scale = Math.min(width / unit.width, (2 * width) / unit.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  try {
    await page.render({ canvas, viewport }).promise;
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.8, 0.6, 0.45, 0.3]) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
        if (!blob || blob.type !== type) break; // encoder unsupported
        if (blob.size <= maxBytes) return blob;
      }
    }
    return null;
  } finally {
    page.cleanup();
    canvas.width = canvas.height = 0; // Safari frees canvas memory only this way
  }
}
