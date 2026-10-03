import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { DocumentRow } from '../../core/db/models';
import { platform } from '../../core/platform';
import { isCloudConfigured } from '../../core/supabase/client';
import { attachFile, downloadDocumentFile, HashMismatch, type DownloadProgress } from '../../core/sync';
import { en } from '../../shared/i18n/en';

type State =
  | { kind: 'downloading'; progress: DownloadProgress | null }
  | { kind: 'failed'; reason: 'offline' | 'mismatch' | 'error' }
  | { kind: 'cancelled' }
  | { kind: 'attach'; mismatch: boolean };

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

/**
 * Opening a document whose file is not on this device (FR-LIB-06, FR-LIB-05): cloud documents download with progress
 * and Cancel; device-only ones (and failed downloads) offer "Attach file", accepted only with the same bytes.
 * Never a blank screen. Calls `onFile` once the file is cached.
 */
export function FileGate({ row, onFile }: { row: DocumentRow; onFile: () => void }) {
  const canDownload = isCloudConfigured() && row.storageMode === 'cloud' && !!row.storagePath;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>(
    canDownload ? { kind: 'downloading', progress: null } : { kind: 'attach', mismatch: false },
  );
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!canDownload || !row.storagePath) return;
    const ac = new AbortController();
    controller.current = ac;
    const doc = { id: row.id, contentHash: row.contentHash, storagePath: row.storagePath, fileSize: row.fileSize };
    downloadDocumentFile(doc, (progress) => setState({ kind: 'downloading', progress }), ac.signal).then(
      onFile,
      (e: unknown) => {
        if (ac.signal.aborted) return setState({ kind: 'cancelled' });
        setState({
          kind: 'failed',
          reason: e instanceof HashMismatch ? 'mismatch' : navigator.onLine ? 'error' : 'offline',
        });
      },
    );
    return () => ac.abort();
  }, [canDownload, row, attempt, onFile]);

  const attach = async () => {
    const [file] = await platform.pickPdfFiles();
    if (!file) return;
    if (await attachFile(row, file)) onFile();
    else setState({ kind: 'attach', mismatch: true });
  };
  const retry = () => {
    setState({ kind: 'downloading', progress: null });
    setAttempt((a) => a + 1);
  };
  const primary = 'min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg';
  const secondary = 'flex min-h-11 items-center rounded-md border border-line-strong px-4 text-ui-fg';
  const copy = en.reader.file;

  return (
    <div
      role={state.kind === 'downloading' ? 'status' : 'alert'}
      className="mx-auto flex h-dvh max-w-md flex-col justify-center gap-3 p-8"
    >
      <h1 className="text-xl font-semibold">{en.reader.errors['no-file'].title}</h1>
      <p className="font-medium">{row.title}</p>
      {state.kind === 'downloading' && (
        <>
          <p className="text-muted">{copy.downloading}</p>
          <progress
            className="h-2 w-full accent-[var(--accent)]"
            aria-label={copy.downloading}
            max={state.progress?.total ?? row.fileSize}
            value={state.progress?.received ?? 0}
          />
          <p className="text-sm text-muted">{copy.progress(mb(state.progress?.received ?? 0), mb(row.fileSize))}</p>
          <button className={`${secondary} self-start`} onClick={() => controller.current?.abort()}>
            {en.common.cancel}
          </button>
        </>
      )}
      {state.kind === 'cancelled' && <p className="text-muted">{copy.cancelled}</p>}
      {state.kind === 'failed' && <p className="text-muted">{copy.failed[state.reason]}</p>}
      {state.kind === 'attach' && (
        <p className="text-muted">
          {state.mismatch
            ? copy.mismatch
            : !isCloudConfigured()
              ? copy.localOnly
              : row.storageMode === 'device'
                ? copy.deviceOnly
                : copy.notUploaded}
        </p>
      )}
      {state.kind !== 'downloading' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canDownload && (
            <button className={primary} onClick={retry}>
              {copy.download}
            </button>
          )}
          <button className={canDownload ? secondary : primary} onClick={() => void attach()}>
            {copy.attach}
          </button>
          <Link to="/" className={secondary}>
            {en.errors.backToLibrary}
          </Link>
        </div>
      )}
    </div>
  );
}
