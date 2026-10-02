import { useEffect, useRef, useState } from 'react';
import { en } from '../../shared/i18n/en';
import type { Viewer } from './pdf/viewer';

const FOUND_STATES = { NOT_FOUND: 1, WRAPPED: 2 } as const; // PDF.js FindState

/** In-document search through PDFFindController (FR-RDR-06): case-insensitive, Enter / Shift+Enter, count. */
export function FindBar({ getViewer, onClose }: { getViewer: () => Viewer | null; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<{ current: number; total: number } | null>(null);
  const [state, setState] = useState<number | null>(null);

  useEffect(() => {
    input.current?.focus();
    const viewer = getViewer();
    if (!viewer) return;
    const onCount = (e: { matchesCount: { current: number; total: number } }) => setCount(e.matchesCount);
    const onState = (e: { state: number; matchesCount?: { current: number; total: number } }) => {
      setState(e.state);
      if (e.matchesCount) setCount(e.matchesCount);
    };
    viewer.eventBus.on('updatefindmatchescount', onCount);
    viewer.eventBus.on('updatefindcontrolstate', onState);
    return () => {
      viewer.eventBus.off('updatefindmatchescount', onCount);
      viewer.eventBus.off('updatefindcontrolstate', onState);
      viewer.eventBus.dispatch('findbarclose', { source: null }); // clears hit highlights
    };
  }, [getViewer]);

  const find = (q: string, type: '' | 'again', findPrevious = false) =>
    getViewer()?.eventBus.dispatch('find', { source: null, type, query: q, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious, matchDiacritics: false });

  const status =
    !query ? '' : state === FOUND_STATES.NOT_FOUND ? en.reader.noMatches : count && count.total > 0 ? en.reader.matches(count.current, count.total) : '';
  const btn = 'grid min-h-11 min-w-11 place-items-center rounded-md text-ui-fg hover:bg-ui-bg disabled:opacity-40';

  return (
    <div role="search" className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1">
      <input
        ref={input}
        type="search"
        aria-label={en.reader.find}
        placeholder={en.reader.findPlaceholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          find(e.target.value, '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') find(query, 'again', e.shiftKey);
          else if (e.key === 'Escape') onClose();
          else return;
          e.preventDefault();
        }}
        className="min-h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-ui-bg px-2 text-ui-fg"
      />
      <span role="status" className="min-w-20 text-center text-xs text-muted">
        {status}
        {state === FOUND_STATES.WRAPPED && <span className="sr-only">. {en.reader.wrapped}</span>}
      </span>
      <button className={btn} aria-label={en.reader.findPrev} disabled={!query} onClick={() => find(query, 'again', true)}>
        ↑
      </button>
      <button className={btn} aria-label={en.reader.findNext} disabled={!query} onClick={() => find(query, 'again')}>
        ↓
      </button>
      <button className={btn} aria-label={en.reader.closeFind} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
