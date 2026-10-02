import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import type { DocumentRow } from '../../core/db/models';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { usePref } from '../../shared/hooks/usePref';
import { en } from '../../shared/i18n/en';
import { canHandleSingleKey, isPrimaryChord } from '../../shared/utils/keys';
import { toast } from '../../shared/ui/toast';
import { ThemeMenu } from '../theme/ThemeMenu';
import { FindBar } from './FindBar';
import { usePinch } from './gestures/usePinch';
import { classifyPointer, type PointerKind } from './gestures/tap';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import { createViewer, ZOOM_MAX, ZOOM_MIN, type PdfViewer, type Viewer } from './pdf/viewer';
import type { OutlineItem } from './sidebar/Outline';
import { Sidebar } from './sidebar/Sidebar';
import { READING_INSET_PX, scrollToPoint, useResume } from './useResume';

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const clamp = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

// PDF.js viewer is external mutable state: writes go through these helpers, not component scope
const setZoom = (v: PdfViewer, value: string) => void (v.currentScaleValue = value);
const rotate = (v: PdfViewer) => void (v.pagesRotation = (v.pagesRotation + 90) % 360); // view only (FR-RDR-09)

const SIDEBAR = ['open', 'closed'] as const;
const PRESET_VALUES = new Set(['page-width', 'page-fit', 'auto']);
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], .annotationLayer a';

function zoomStep(v: PdfViewer, dir: 1 | -1) {
  const cur = v.currentScale;
  const next = dir > 0 ? PRESETS.find((p) => p > cur + 0.01) : PRESETS.findLast((p) => p < cur - 0.01);
  if (next) v.currentScale = next;
}

/** Phones: hide bars on scroll down, show on scroll up / near the top; a tap on blank space toggles (§10.3). */
function useAutoHideChrome(enabled: boolean, container: RefObject<HTMLDivElement | null>, setChrome: (fn: (c: boolean) => boolean) => void) {
  useEffect(() => {
    const el = container.current;
    if (!enabled || !el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      if (Math.abs(top - last) < 12) return;
      const show = top < last || top < 64;
      setChrome(() => show);
      last = top;
    };
    let down: { x: number; y: number; t: number; kind: PointerKind; max: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.isPrimary && !(e.target as Element).closest(INTERACTIVE) ? { x: e.clientX, y: e.clientY, t: e.timeStamp, kind: e.pointerType as PointerKind, max: 0 } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (down) down.max = Math.max(down.max, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    };
    const onUp = (e: PointerEvent) => {
      if (down && classifyPointer(down.kind, down, { x: e.clientX, y: e.clientY, t: e.timeStamp }, down.max, e.detail) === 'tap' && window.getSelection()?.isCollapsed !== false)
        setChrome((c) => !c);
      down = null;
    };
    const cancel = () => (down = null);
    const onClick = (e: MouseEvent) => (e.target as Element).closest('.annotationLayer a') && setChrome(() => false); // reading mode after a link jump
    el.addEventListener('click', onClick);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('click', onClick);
    };
  }, [enabled, container, setChrome]);
}

/** Reader shell (FR-RDR-01..03, FR-RDR-12; phones: T-112, PRD §10.3). */
export function ReaderView({ row, pdf }: { row: DocumentRow; pdf: PDFDocumentProxy }) {
  const container = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<Viewer | null>(null); // PDF.js objects are external and mutable: a ref, not state
  const [ready, setReady] = useState(false);
  const [pagesReady, setPagesReady] = useState(false); // page boxes laid out at the initial scale
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState<{ value: number; preset?: string }>({ value: 1, preset: 'page-width' });
  const [draft, setDraft] = useState<string | null>(null);
  const [sidebar, setSidebar] = usePref('reader.sidebar', SIDEBAR, window.innerWidth >= 1024 ? 'open' : 'closed');
  const [finding, setFinding] = useState(false);
  const [chrome, setChrome] = useState(true);
  const compact = useMediaQuery('(max-width: 767px)');
  const pages = pdf.numPages;
  const getViewer = useCallback(() => viewerRef.current, []); // stable: effects keyed on it must not re-run per render
  // reading slot = viewport top + chrome overlaying the page + 8 px (PRD §5); read from layout, so it stays stable
  const getInset = useCallback(() => {
    const bar = topBar.current;
    return bar && getComputedStyle(bar).position === 'absolute' ? bar.offsetHeight + READING_INSET_PX : READING_INSET_PX;
  }, []);

  useEffect(() => {
    let created: Viewer | undefined;
    let cancelled = false;
    void createViewer(container.current!, pdf, row.contentHash).then((v) => {
      if (cancelled) return v.destroy();
      created = v;
      v.eventBus.on('pagesinit', () => {
        v.viewer.currentScaleValue = 'page-width'; // default (FR-RDR-03); zoom is device-local, never synced
        container.current?.focus({ preventScroll: true }); // arrows/space scroll right away
        setPagesReady(true);
      });
      v.eventBus.on('pagechanging', (e: { pageNumber: number }) => setPage(e.pageNumber));
      v.eventBus.on('scalechanging', (e: { scale: number; presetValue?: string }) => setScale({ value: e.scale, preset: e.presetValue }));
      viewerRef.current = v;
      setReady(true);
    });
    return () => {
      cancelled = true;
      viewerRef.current = null;
      created?.destroy();
    };
  }, [pdf, row.contentHash]);

  // Keyboard (FR-RDR-02/03). Single keys respect the text-field/IME guard (FR-KEY-02).
  useEffect(() => {
    const v = viewerRef.current?.viewer;
    if (!ready || !v) return;
    const onKey = (e: KeyboardEvent) => {
      if (isPrimaryChord(e)) {
        if (e.key === '=' || e.key === '+') zoomStep(v, 1);
        else if (e.key === '-') zoomStep(v, -1);
        else if (e.key === '0') v.currentScaleValue = 'page-width';
        else if (e.key === 'f' || e.key === 'F') setFinding(true); // our search, not the browser's (FR-RDR-06)
        else return;
        e.preventDefault(); // instead of browser page zoom
        return;
      }
      if (!canHandleSingleKey(e)) return;
      if (e.key === 'g' || e.key === 'G') {
        pageInput.current?.focus();
        pageInput.current?.select();
      } else if (e.key === 'Home') v.currentPageNumber = 1;
      else if (e.key === 'End') v.currentPageNumber = v.pagesCount;
      else if (e.key === 'PageDown') v.nextPage();
      else if (e.key === 'PageUp') v.previousPage();
      else if (e.key === 's' || e.key === 'S') setSidebar((s) => (s === 'open' ? 'closed' : 'open'));
      else if (e.key === '/') setFinding(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, setSidebar]);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms around the pointer; PDF.js rounds scale to 0.01, so accumulate.
  useEffect(() => {
    const el = container.current;
    const v = viewerRef.current?.viewer;
    if (!ready || !el || !v) return;
    let acc = 1;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
      const target = clamp(v.currentScale * acc);
      if (Math.abs(target - v.currentScale) >= 0.01) {
        v.updateScale({ scaleFactor: target / v.currentScale, origin: [e.clientX, e.clientY], drawingDelay: 400 });
        acc = 1;
      } else if (target === ZOOM_MIN || target === ZOOM_MAX) acc = 1;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ready]);

  usePinch(ready, getViewer, container);
  useAutoHideChrome(compact && ready, container, setChrome);
  useResume({ pagesReady, getViewer, getInset, container, documentId: row.id });

  // PDFViewer does not watch its container: re-fit fit-width/fit-page when the viewer area resizes
  useEffect(() => {
    const el = container.current;
    if (!ready || !el) return;
    const ro = new ResizeObserver(() => {
      const v = viewerRef.current?.viewer;
      if (v && PRESET_VALUES.has(v.currentScaleValue)) setZoom(v, v.currentScaleValue);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  /** Our own page jumps land the page top at the reading slot, clear of overlay chrome. */
  const jumpTo = (n: number) => {
    const v = viewerRef.current?.viewer;
    const el = container.current;
    if (v && el) scrollToPoint(v, el, n, 0, 0.5, getInset());
  };
  const goToFromSidebar = (n: number) => {
    jumpTo(n);
    if (compact) setSidebar('closed');
  };
  const openOutline = (item: OutlineItem) => {
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
    else if (item.dest) void viewerRef.current?.linkService.goToDestination(item.dest);
    if (compact) {
      setSidebar('closed');
      setChrome(false); // PDF.js puts destinations at the scroller top: hide the bar over it
    }
  };

  const commitPage = () => {
    const v = viewerRef.current?.viewer;
    if (draft === null || !v) return;
    const n = Number(draft.trim());
    if (Number.isInteger(n) && n >= 1 && n <= pages) jumpTo(n);
    else if (draft.trim() !== String(page)) toast(en.reader.noSuchPage(draft.trim(), pages)); // ignored, with feedback
    setDraft(null);
  };

  const zoomValue = scale.preset ?? (PRESETS.find((p) => Math.abs(p - scale.value) < 0.005)?.toString() ?? 'custom');
  const btn = 'grid min-h-11 min-w-11 place-items-center rounded-md text-ui-fg hover:bg-ui-bg disabled:opacity-40';
  const showChrome = !compact || chrome || finding || sidebar === 'open';

  const sidebarToggle = (
    <button
      className={btn}
      aria-label={en.reader.toggleSidebar}
      aria-expanded={sidebar === 'open'}
      aria-controls="reader-sidebar"
      onClick={() => setSidebar((s) => (s === 'open' ? 'closed' : 'open'))}
    >
      ☰
    </button>
  );
  const pageField = (
    <span className="flex items-center gap-1">
      <input
        ref={pageInput}
        aria-label={en.reader.pageInput}
        inputMode="numeric"
        enterKeyHint="go"
        className="min-h-9 w-12 rounded-md border border-line-strong bg-ui-bg text-center text-ui-fg"
        value={draft ?? String(page)}
        onFocus={(e) => {
          setDraft(String(page));
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitPage}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="whitespace-nowrap text-muted">{en.reader.pageOf(pages)}</span>
    </span>
  );
  const slide = (hidden: string) => `transition-transform duration-200 motion-reduce:transition-none ${showChrome ? '' : hidden}`;

  return (
    <div className={`relative flex h-dvh flex-col bg-ui-bg ${compact ? 'reader-compact' : ''}`}>
      {/* focus inside a hidden bar (keyboard, screen reader) brings the chrome back */}
      <div ref={topBar} onFocus={() => setChrome(true)} className={compact ? `absolute inset-x-0 top-0 z-10 ${slide('-translate-y-full')}` : ''}>
        <header
          role="toolbar"
          aria-label={en.reader.toolbar}
          className="flex items-center gap-1 border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)] text-sm"
        >
          {!compact && sidebarToggle}
          <Link to="/" className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-ui-fg hover:bg-ui-bg">
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">{en.reader.back}</span>
            <span className="sr-only sm:hidden">{en.reader.back}</span>
          </Link>
          <h1 className="mx-2 min-w-0 flex-1 truncate font-medium">{row.title}</h1>
          {!compact && (
            <>
              <button className={btn} aria-label={en.reader.prevPage} disabled={page <= 1} onClick={() => viewerRef.current?.viewer.previousPage()}>
                ‹
              </button>
              {pageField}
              <button className={btn} aria-label={en.reader.nextPage} disabled={page >= pages} onClick={() => viewerRef.current?.viewer.nextPage()}>
                ›
              </button>
              <button className={btn} aria-label={en.reader.zoomOut} onClick={() => viewerRef.current && zoomStep(viewerRef.current.viewer, -1)}>
                −
              </button>
              <select
                aria-label={en.reader.zoom}
                value={zoomValue}
                onChange={(e) => {
                  const v = viewerRef.current?.viewer;
                  if (v && e.target.value !== 'custom') setZoom(v, e.target.value);
                }}
                className="min-h-9 rounded-md border border-line-strong bg-ui-bg px-1 text-ui-fg"
              >
                <option value="page-width">{en.reader.fitWidth}</option>
                <option value="page-fit">{en.reader.fitPage}</option>
                {PRESETS.map((p) => (
                  <option key={p} value={String(p)}>
                    {en.reader.percent(Math.round(p * 100))}
                  </option>
                ))}
                {zoomValue === 'custom' && <option value="custom">{en.reader.percent(Math.round(scale.value * 100))}</option>}
              </select>
              <button className={btn} aria-label={en.reader.zoomIn} onClick={() => viewerRef.current && zoomStep(viewerRef.current.viewer, 1)}>
                +
              </button>
              <button className={btn} aria-label={en.reader.rotate} onClick={() => viewerRef.current && rotate(viewerRef.current.viewer)}>
                ⟳
              </button>
            </>
          )}
          <button className={btn} aria-label={en.reader.find} aria-expanded={finding} onClick={() => setFinding((f) => !f)}>
            ⌕
          </button>
          {!compact && <ThemeMenu />}
        </header>
        {finding && ready && <FindBar getViewer={getViewer} onClose={() => setFinding(false)} />}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {sidebar === 'open' && (
          <>
            {/* phones: drawer over the page with a backdrop; md+: docked column */}
            <button aria-label={en.common.close} className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSidebar('closed')} />
            <aside
              id="reader-sidebar"
              aria-label={en.reader.sidebar}
              className="fixed inset-y-0 left-0 z-30 w-[min(20rem,85vw)] border-r border-line pt-[env(safe-area-inset-top)] md:static md:z-auto md:w-64 md:pt-0"
            >
              <Sidebar pdf={pdf} current={page} onPage={goToFromSidebar} onOutline={openOutline} />
            </aside>
          </>
        )}
        <div className="relative min-w-0 flex-1">
          <div ref={container} tabIndex={0} aria-label={row.title} className="reader-scroll outline-none">
            <div className="pdfViewer" />
          </div>
        </div>
      </div>
      {compact && (
        <div
          role="toolbar"
          aria-label={en.reader.bottomBar}
          onFocus={() => setChrome(true)}
          className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] text-sm ${slide('translate-y-full')}`}
        >
          {pageField}
          <input
            type="range"
            aria-label={en.reader.scrubber}
            aria-valuetext={en.reader.pageThumb(page)}
            min={1}
            max={pages}
            value={page}
            onChange={(e) => {
              jumpTo(Number(e.target.value)); // scrubber (FR-RDR-02)
            }}
            className="min-h-11 min-w-0 flex-1 accent-[var(--accent)]"
          />
          {sidebarToggle}
          <ThemeMenu />
        </div>
      )}
    </div>
  );
}
