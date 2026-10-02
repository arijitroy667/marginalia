import { createPortal } from 'react-dom';
import { markerY } from '../../../core/anchors/anchor';
import { fromCanonical } from '../../../core/anchors/geometry';
import type { Anchor, NRect } from '../../../core/anchors/types';
import type { AnnotationRow } from '../../../core/db/models';
import type { PageHosts } from './hosts';
import { svgRect } from './coords';

export interface PageOverlayProps {
  hosts: PageHosts;
  rotation: number;
  highlights: AnnotationRow[];
  hover?: NRect | undefined;
  selected?: NRect[] | undefined;
  markers?: { key: string; anchor: Anchor; node: React.ReactNode }[];
  banner?: string | undefined;
}

/** Highlights + hover/selection bands under the text layer; gutter markers above it (PRD §8.4, §10.4). */
export function PageLayers({ hosts, rotation, highlights, hover, selected, markers = [], banner }: PageOverlayProps) {
  return (
    <>
      {createPortal(
        <svg className="mg-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {highlights.map((h) =>
            h.anchor.rects.map((r, i) => (
              <rect key={`${h.id}:${i}`} className="mg-hl" data-id={h.id} style={{ fill: `var(--hl-${h.colorId ?? 1}, #c9c9c9)` }} {...svgRect(r, rotation)} />
            )),
          )}
          {hover && <rect className="mg-hover" {...svgRect(hover, rotation)} />}
          {selected?.map((r, i) => <rect key={i} className="mg-selected" {...svgRect(r, rotation)} />)}
        </svg>,
        hosts.under,
      )}
      {banner && createPortal(<p className="mg-banner">{banner}</p>, hosts.over)}
      {markers.length > 0 &&
        createPortal(
          <div className="mg-gutter">
            {markers.map((m) => {
              // marker at the anchor's vertical centre, in the displayed (rotated) page box
              const top = fromCanonical({ x: 0.5, y: markerY(m.anchor), w: 0, h: 0 }, rotation).y;
              return (
                <div key={m.key} className="mg-marker" style={{ top: `${top * 100}%` }}>
                  {m.node}
                </div>
              );
            })}
          </div>,
          hosts.over,
        )}
    </>
  );
}
