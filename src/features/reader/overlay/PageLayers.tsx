import { createPortal } from 'react-dom';
import { groupByLine, markerY } from '../../../core/anchors/anchor';
import { fromCanonical } from '../../../core/anchors/geometry';
import type { Anchor, NRect } from '../../../core/anchors/types';
import type { AnnotationRow } from '../../../core/db/models';
import type { PageHosts } from './hosts';
import { svgRect } from './coords';

export interface Marker {
  key: string;
  anchor: Anchor;
  node: React.ReactNode;
}

export interface PageOverlayProps {
  hosts: PageHosts;
  rotation: number;
  highlights: AnnotationRow[];
  noted?: ReadonlySet<string>; // highlights with a note on their line: wash + 2 px left rule (§10.4)
  hover?: NRect | undefined;
  selected?: NRect[] | undefined;
  flash?: { rects: NRect[]; id: number } | undefined;
  resume?: Anchor | undefined;
  markers?: Marker[];
  banner?: string | undefined;
}

/** Highlights + hover/selection bands under the text layer; gutter markers above it (PRD §8.4, §10.4). */
export function PageLayers({
  hosts,
  rotation,
  highlights,
  noted,
  hover,
  selected,
  flash,
  resume,
  markers = [],
  banner,
}: PageOverlayProps) {
  const displayY = (a: Anchor) => fromCanonical({ x: 0.5, y: markerY(a), w: 0, h: 0 }, rotation).y; // anchor's vertical centre on screen
  return (
    <>
      {createPortal(
        <svg className="mg-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {highlights.map((h) =>
            h.anchor.rects.map((r, i) => (
              <rect
                key={`${h.id}:${i}`}
                className="mg-hl"
                data-id={h.id}
                style={{ fill: `var(--hl-${h.colorId ?? 1}, #c9c9c9)` }}
                {...svgRect(r, rotation)}
              />
            )),
          )}
          {highlights.map((h) => {
            const r = h.anchor.rects[0];
            if (!r || !noted?.has(h.id)) return null;
            const d = svgRect(r, rotation);
            return (
              <line
                key={`${h.id}:rule`}
                className="mg-hl-rule"
                x1={d.x}
                y1={d.y}
                x2={d.x}
                y2={d.y + d.height}
                style={{ stroke: `var(--hl-${h.colorId ?? 1}, #c9c9c9)` }}
              />
            );
          })}
          {hover && <rect className="mg-hover" {...svgRect(hover, rotation)} />}
          {selected?.map((r, i) => (
            <rect key={i} className="mg-selected" {...svgRect(r, rotation)} />
          ))}
          {flash?.rects.map((r, i) => (
            <rect key={`${flash.id}:${i}`} className="mg-flash" {...svgRect(r, rotation)} />
          ))}
        </svg>,
        hosts.under,
      )}
      {banner && createPortal(<p className="mg-banner">{banner}</p>, hosts.over)}
      {resume &&
        createPortal(
          <div className="mg-resume" aria-hidden="true" style={{ top: `${displayY(resume) * 100}%` }} />,
          hosts.over,
        )}
      {markers.length > 0 &&
        createPortal(
          <div className="mg-gutter">
            {/* markers on one line share a row and stack horizontally (§10.2) */}
            {groupByLine(markers, (m) => m.anchor).map((row) => (
              <div key={row[0]!.key} className="mg-marker" style={{ top: `${displayY(row[0]!.anchor) * 100}%` }}>
                {row.map((m) => (
                  <span key={m.key} className="contents">
                    {m.node}
                  </span>
                ))}
              </div>
            ))}
          </div>,
          hosts.over,
        )}
    </>
  );
}
