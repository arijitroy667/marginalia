/** Add-PDF pipeline (FR-LIB-01..03, FR-SYN-07): validate -> hash -> dedupe -> open -> metadata/cover -> store. */
import { MAX_CLOUD_FILE_BYTES, MAX_FILE_BYTES } from '../../config';
import type { DocumentRow } from '../../core/db/models';
import { documentsRepo, libraryRepo, metaRepo } from '../../core/db/repos';
import { platform } from '../../core/platform';
import { hasPdfHeader, sha256Blob } from '../../shared/utils/hash';
import type { PasswordPrompt } from '../reader/pdf/pdfjs';

export type AddRejection = 'empty' | 'too-large' | 'not-pdf' | 'corrupt' | 'password-cancelled';
export type AddResult =
  | { kind: 'added' | 'existing'; document: DocumentRow }
  | { kind: 'rejected'; reason: AddRejection };

const reject = (reason: AddRejection): AddResult => ({ kind: 'rejected', reason });

export async function addPdf(file: File, askPassword: PasswordPrompt, onHashProgress?: (f: number) => void): Promise<AddResult> {
  if (file.size === 0) return reject('empty');
  if (file.size > MAX_FILE_BYTES) return reject('too-large');
  // magic bytes decide, not the (often missing or wrong) MIME type
  if (!hasPdfHeader(new Uint8Array(await file.slice(0, 1024).arrayBuffer()))) return reject('not-pdf');

  const contentHash = await sha256Blob(file, onHashProgress);
  const known = await documentsRepo.findByHash(contentHash);
  if (known) return { kind: 'existing', document: known };

  const { openPdf, PasswordCancelled } = await import('../reader/pdf/pdfjs');
  const { readPdfInfo, renderCover } = await import('./pdfInfo');
  let doc;
  try {
    doc = await openPdf(file, askPassword);
  } catch (e) {
    return reject(e instanceof PasswordCancelled ? 'password-cancelled' : 'corrupt');
  }
  try {
    const info = await readPdfInfo(doc, file.name);
    const cover = await renderCover(doc).catch(() => null);
    const { document, existing } = await libraryRepo.addDocument(
      {
        id: crypto.randomUUID(),
        contentHash,
        ...info,
        fileSize: file.size,
        // files over the cloud cap stay on this device; annotations still sync (FR-LIB-05)
        storageMode: file.size > MAX_CLOUD_FILE_BYTES ? 'device' : 'cloud',
        storagePath: null,
        coverPath: null,
      },
      file,
      cover,
    );
    if (!(await metaRepo.get<boolean>('persistRequested'))) {
      await metaRepo.set('persistRequested', true);
      void platform.persistStorage(); // once, on first add (FR-SYN-07)
    }
    return { kind: existing ? 'existing' : 'added', document };
  } catch {
    return reject('corrupt');
  } finally {
    void doc.loadingTask.destroy(); // PDF.js 6: teardown lives on the loading task
  }
}
