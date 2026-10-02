/**
 * PDF.js entry point (PRD §8.4). Loaded lazily (NFR-PERF-08). Uploaded PDFs are untrusted (NFR-SEC-03):
 * parsing/rendering stays in the worker, XFA is off, and PDF.js 6 has no eval code paths (ADR 0008).
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const base = `${import.meta.env.BASE_URL}pdfjs/`;
export const PDF_ASSETS = {
  cMapUrl: `${base}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${base}standard_fonts/`,
  wasmUrl: `${base}wasm/`,
  iccUrl: `${base}iccs/`,
};

/** Serves only the byte ranges PDF.js requests, straight from the Blob (no full copy on the main thread). */
class BlobRangeTransport extends pdfjs.PDFDataRangeTransport {
  constructor(private readonly blob: Blob) {
    super(blob.size, null);
  }
  override requestDataRange(begin: number, end: number): void {
    void this.blob
      .slice(begin, end)
      .arrayBuffer()
      .then((b) => this.onDataRange(begin, new Uint8Array(b)));
  }
}

export class PasswordCancelled extends Error {}

/** Asks for a password; `retry` is true after a wrong one. Resolve null to cancel. Never stored (FR-LIB-01). */
export type PasswordPrompt = (retry: boolean) => Promise<string | null>;

export function openPdf(blob: Blob, askPassword?: PasswordPrompt): Promise<pdfjs.PDFDocumentProxy> {
  const task = pdfjs.getDocument({ range: new BlobRangeTransport(blob), ...PDF_ASSETS, enableXfa: false });
  let cancelled = false;
  task.onPassword = (update: (password: string) => void, reason: number) => {
    const retry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    void (askPassword?.(retry) ?? Promise.resolve(null)).then((pw) => {
      if (pw === null) {
        cancelled = true;
        void task.destroy();
      } else update(pw);
    });
  };
  return task.promise.catch((e: unknown) => {
    throw cancelled ? new PasswordCancelled() : e;
  });
}

export type { PDFDocumentProxy } from 'pdfjs-dist';
