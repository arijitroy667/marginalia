import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { annotationsRepo, metaRepo } from '../../core/db/repos';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { en } from '../../shared/i18n/en';
import { CheckIcon } from '../../shared/ui/icons';
import { useReaderStore } from './store';

const DONE = 'coachDone';

/**
 * First-run coach mark (§10.5): tap a line / press H / press N. Each step ticks itself as the reader does it; the
 * card goes away for good on this device once all three are done or the user hides it.
 */
export function CoachMark({ documentId }: { documentId: string }) {
  const done = useLiveQuery(async () => (await metaRepo.get<boolean>(DONE)) ?? false, []); // undefined = loading
  const touch = useMediaQuery('(pointer: coarse)');
  const selected = useReaderStore((s) => s.selection !== null);
  const noteOpen = useReaderStore((s) => s.notes !== null);
  const kinds = useLiveQuery(
    async () => new Set((await annotationsRepo.ofDocument(documentId)).map((a) => a.kind)),
    [documentId],
  );
  const [ticks, setTicks] = useState([false, false, false]);

  const now = [selected, !!kinds?.has('highlight'), noteOpen || !!kinds?.has('note')];
  if (now.some((n, i) => n && !ticks[i])) setTicks(ticks.map((t, i) => t || now[i]!)); // steps stay ticked
  const all = ticks.every(Boolean);
  useEffect(() => {
    if (!all) return;
    const t = setTimeout(() => void metaRepo.set(DONE, true), 1500); // let the last tick show
    return () => clearTimeout(t);
  }, [all]);

  if (done !== false) return null;
  const steps = en.coach.steps[touch ? 'touch' : 'pointer'];
  return (
    <aside
      aria-labelledby="coach-title"
      className="absolute bottom-20 left-3 z-20 w-[min(18rem,calc(100%-1.5rem))] rounded-xl border border-line bg-surface p-3 text-sm text-ui-fg shadow-lg md:bottom-4"
    >
      <h2 id="coach-title" className="mb-2 font-medium">
        {en.coach.title}
      </h2>
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${ticks[i] ? 'text-muted line-through' : ''}`}>
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border border-line-strong"
              aria-hidden="true"
            >
              {ticks[i] ? <CheckIcon width={12} height={12} /> : i + 1}
            </span>
            <span>
              {s}
              {ticks[i] && <span className="sr-only"> ({en.coach.done})</span>}
            </span>
          </li>
        ))}
      </ol>
      <button
        className="mt-2 min-h-11 rounded-md px-2 text-accent hover:bg-ui-bg"
        onClick={() => void metaRepo.set(DONE, true)}
      >
        {en.coach.later}
      </button>
    </aside>
  );
}
