import { useLiveQuery } from 'dexie-react-hooks';
import { outboxRepo } from '../../core/db/repos';
import { platform } from '../../core/platform';
import { syncNow } from '../../core/sync';
import { en } from '../../shared/i18n/en';

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Downloads the failed items so nothing is lost even if they are discarded (FR-SYN-10). */
const exportJson = (items: unknown[]) =>
  platform.saveFile(
    `marginalia-sync-issues-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(items, null, 2),
    'application/json',
  );

/** "Sync issues" (FR-SYN-10): failed outbox items with their error; retry, discard, export as JSON. */
export function SyncIssuesPage() {
  const items = useLiveQuery(() => outboxRepo.failed(), []);
  const btn = 'min-h-11 rounded-md px-3 text-sm hover:bg-ui-bg';
  const retry = (fn: () => Promise<void>) => void fn().then(syncNow);
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{en.sync.issuesTitle}</h1>
      {items && items.length === 0 && <p className="text-muted">{en.sync.noIssues}</p>}
      {items && items.length > 0 && (
        <>
          <p className="text-muted">{en.sync.issuesIntro}</p>
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} border border-line-strong`} onClick={() => retry(() => outboxRepo.retryAll())}>
              {en.sync.retryAll}
            </button>
            <button className={`${btn} border border-line-strong`} onClick={() => exportJson(items)}>
              {en.sync.exportJson}
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {items.map((i) => (
              <li key={i.seq} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {en.sync.entity[i.entity]} · <span className="font-mono text-xs text-muted">{i.entityId}</span>
                  </p>
                  {/* the server's message only: payloads may hold note text, which is never shown or logged here */}
                  <p className="text-sm text-accent">{i.lastError ?? en.sync.unknownError}</p>
                  <p className="text-xs text-muted">
                    {time.format(new Date(i.createdAt))} · {en.sync.attempts(i.attempts)}
                  </p>
                </div>
                <button className={btn} onClick={() => retry(() => outboxRepo.retry(i.seq!))}>
                  {en.sync.retry}
                </button>
                <button className={btn} onClick={() => void outboxRepo.discard(i.seq!)}>
                  {en.sync.discard}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
