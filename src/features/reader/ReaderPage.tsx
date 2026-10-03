import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { DocumentRow } from '../../core/db/models';
import { coversRepo, documentsRepo, filesRepo } from '../../core/db/repos';
import { db } from '../../core/db/schema';
import { en } from '../../shared/i18n/en';
import { usePasswordPrompt } from '../library/PasswordDialog';
import { openPdf, PasswordCancelled, type PDFDocumentProxy } from './pdf/pdfjs';
import { FileGate } from './FileGate';
import { ReaderError, type ReaderErrorKind } from './ReaderError';
import { ReaderView } from './ReaderView';
import './reader.css';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; row: DocumentRow; pdf: PDFDocumentProxy }
  | { kind: 'no-file'; row: DocumentRow }
  | { kind: 'error'; reason: ReaderErrorKind };

function classify(e: unknown): ReaderErrorKind {
  if (e instanceof PasswordCancelled) return 'locked';
  return e instanceof Error && /InvalidPDF|MissingPDF|FormatError/.test(e.name) ? 'corrupt' : 'unsupported';
}

/** /read/:documentId — loads the local row and file, opens the PDF (with password prompt), or explains why not. */
export function ReaderPage() {
  const { documentId = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const { prompt, dialog } = usePasswordPrompt();

  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | undefined;
    const settle = (p: Phase) => !cancelled && setPhase(p);
    void (async () => {
      const row = await db.documents.get(documentId);
      if (!row || row.deletedAt) return settle({ kind: 'error', reason: 'not-found' });
      const blob = await filesRepo.get(documentId);
      if (!blob) return settle({ kind: 'no-file', row }); // download or attach (FR-LIB-06)
      try {
        pdf = await openPdf(blob, prompt(row.title));
      } catch (e) {
        return settle({ kind: 'error', reason: classify(e) });
      }
      if (cancelled) return void pdf.loadingTask.destroy();
      void documentsRepo.update(documentId, { lastOpenedAt: new Date().toISOString() });
      // a file that arrived by download or attach has no library cover yet
      if (!(await coversRepo.has(documentId)))
        void import('../library/pdfInfo').then(({ renderCover }) =>
          renderCover(pdf!)
            .then((c) => c && coversRepo.put(documentId, c))
            .catch(() => undefined),
        );
      settle({ kind: 'ready', row, pdf });
    })();
    return () => {
      cancelled = true;
      void pdf?.loadingTask.destroy();
    };
  }, [documentId, attempt, prompt]);

  const retry = () => {
    setPhase({ kind: 'loading' });
    setAttempt((a) => a + 1);
  };

  return (
    <>
      {phase.kind === 'loading' && (
        <p role="status" className="grid h-dvh place-items-center text-muted">
          {en.reader.loading}
        </p>
      )}
      {phase.kind === 'error' && <ReaderError kind={phase.reason} onRetry={retry} />}
      {phase.kind === 'no-file' && <FileGate row={phase.row} onFile={retry} />}
      {phase.kind === 'ready' && <ReaderView row={phase.row} pdf={phase.pdf} />}
      {dialog}
    </>
  );
}
