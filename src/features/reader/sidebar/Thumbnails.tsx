import { useEffect, useRef, useState } from 'react';
import { en } from '../../../shared/i18n/en';
import type { PDFDocumentProxy } from '../pdf/pdfjs';

const WIDTH = 120; // CSS px
const urls = new WeakMap<PDFDocumentProxy, Map<number, string>>();
let queue: Promise<unknown> = Promise.resolve(); // one thumbnail at a time: the main view keeps priority

/** Renders page `n` small, once per open document; kept as a compressed JPEG object URL (FR-RDR-04). */
function thumbnail(pdf: PDFDocumentProxy, n: number, stillWanted: () => boolean): Promise<string | null> {
  const cache = urls.get(pdf) ?? urls.set(pdf, new Map()).get(pdf)!;
  const hit = cache.get(n);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    if (!stillWanted()) return null;
    const page = await pdf.getPage(n);
    const unit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (WIDTH * Math.min(2, devicePixelRatio)) / unit.width });
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
    try {
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.7));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      cache.set(n, url);
      return url;
    } finally {
      canvas.width = canvas.height = 0;
    }
  });
  queue = job.catch(() => null);
  return job;
}

export function revokeThumbnails(pdf: PDFDocumentProxy): void {
  urls.get(pdf)?.forEach((u) => URL.revokeObjectURL(u));
  urls.delete(pdf);
}

function Thumb({ pdf, n, aspect, current, onSelect }: { pdf: PDFDocumentProxy; n: number; aspect: number; current: boolean; onSelect: (n: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = false;
    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
        if (visible) void thumbnail(pdf, n, () => visible).then((u) => u && setUrl(u));
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pdf, n]);

  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <li style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${Math.round(WIDTH * aspect) + 24}px` }}>
      <button
        ref={ref}
        aria-label={en.reader.pageThumb(n)}
        aria-current={current ? 'page' : undefined}
        onClick={() => onSelect(n)}
        className={`mx-auto flex flex-col items-center gap-1 rounded-md p-1 text-xs text-muted ${current ? 'ring-2 ring-accent' : 'hover:bg-ui-bg'}`}
      >
        <span className="block bg-white shadow" style={{ width: WIDTH, height: Math.round(WIDTH * aspect) }}>
          {url && <img src={url} alt="" width={WIDTH} className="h-full w-full" />}
        </span>
        {n}
      </button>
    </li>
  );
}

export function Thumbnails({ pdf, current, aspect, onSelect }: { pdf: PDFDocumentProxy; current: number; aspect: number; onSelect: (n: number) => void }) {
  return (
    <ol className="flex flex-col gap-2 p-2">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <Thumb key={i + 1} pdf={pdf} n={i + 1} aspect={aspect} current={current === i + 1} onSelect={onSelect} />
      ))}
    </ol>
  );
}
