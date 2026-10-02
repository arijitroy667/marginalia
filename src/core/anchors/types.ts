/** Normalised rectangle (0..1) in canonical page space, top-left origin (PRD §8.2 rule 5). */
export interface NRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Durable address of an annotation (PRD §8.6). `rects` are the source of truth for drawing. */
export interface Anchor {
  v: 1;
  page: number; // 1-based
  rects: NRect[]; // one per visual line fragment, reading order
  quote: { exact: string; prefix: string; suffix: string }; // NFC; exact <= 400, prefix/suffix <= 32
  hint?: { start: number; end: number; engine: number }; // offsets into PageLines.textNorm (volatile)
}
