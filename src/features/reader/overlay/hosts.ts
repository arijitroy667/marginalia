/**
 * Per-page overlay hosts (PRD §8.4). PDF.js owns each page div and its reset() removes foreign children, so
 * the hosts are stable elements re-attached on every (re)render; React portals keep rendering into them.
 *   under: right after .canvasWrapper, before the text layer -> highlights and bands paint above the canvas
 *          but below the selectable text (pointer-events: none)
 *   over:  last child, above text/link layers -> gutter markers (only the markers take pointer events)
 */
import { useEffect, useState } from 'react';
import { pageViewAt, type Viewer } from '../pdf/viewer';

export interface PageHosts {
  under: HTMLDivElement;
  over: HTMLDivElement;
}

const make = (cls: string) => Object.assign(document.createElement('div'), { className: cls });

/** Map of page number -> hosts for pages PDF.js has rendered (re-attached after resets). */
export function usePageHosts(ready: boolean, getViewer: () => Viewer | null): Map<number, PageHosts> {
  const [hosts, setHosts] = useState(() => new Map<number, PageHosts>());

  useEffect(() => {
    const v = getViewer();
    if (!ready || !v) return;
    const all = new Map<number, PageHosts>();
    const seat = ({ pageNumber }: { pageNumber: number }) => {
      const div = pageViewAt(v.viewer, pageNumber - 1)?.div;
      if (!div) return;
      let h = all.get(pageNumber);
      if (!h) {
        h = { under: make('mg-under'), over: make('mg-over') };
        all.set(pageNumber, h);
        setHosts(new Map(all));
      }
      const canvas = div.querySelector(':scope > .canvasWrapper');
      if (canvas && canvas.nextSibling !== h.under) canvas.after(h.under);
      else if (!canvas && h.under.parentNode !== div) div.prepend(h.under);
      if (div.lastChild !== h.over) div.append(h.over);
    };
    const events = ['pagerender', 'pagerendered', 'textlayerrendered', 'annotationlayerrendered'];
    events.forEach((e) => v.eventBus.on(e, seat));
    // pages PDF.js rendered before this effect subscribed would otherwise never get hosts (race on slow devices)
    for (let i = 0; i < v.viewer.pagesCount; i++)
      if (pageViewAt(v.viewer, i)?.div.querySelector(':scope > .canvasWrapper')) seat({ pageNumber: i + 1 });
    return () => events.forEach((e) => v.eventBus.off(e, seat));
  }, [ready, getViewer]);

  return hosts;
}
