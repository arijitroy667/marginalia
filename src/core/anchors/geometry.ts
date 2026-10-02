/**
 * The only place that converts between canonical and displayed page space (CLAUDE.md rule 5).
 * Canonical = the page as PDF.js lays it out at user rotation 0 (intrinsic /Rotate applied), normalised
 * 0..1, top-left origin. Displayed = the page box after the user's view rotation (clockwise, 0/90/180/270).
 * Normalised coordinates make the mapping independent of zoom and aspect ratio (ADR 0003).
 */
import type { NRect } from './types';

export type Rotation = 0 | 90 | 180 | 270;

export const normRotation = (deg: number): Rotation => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;

/** Canonical rect -> displayed rect under a clockwise view rotation. */
export function fromCanonical(r: NRect, rotation: number): NRect {
  switch (normRotation(rotation)) {
    case 90:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    case 270:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    default:
      return { ...r };
  }
}

/** Displayed rect -> canonical rect (inverse of fromCanonical). */
export const toCanonical = (r: NRect, rotation: number): NRect => fromCanonical(r, 360 - normRotation(rotation));

/** Rect from absolute pixel coordinates relative to a page box (any zoom), normalised to 0..1. */
export function normalize(px: { left: number; top: number; width: number; height: number }, page: { width: number; height: number }): NRect {
  return { x: px.left / page.width, y: px.top / page.height, w: px.width / page.width, h: px.height / page.height };
}
