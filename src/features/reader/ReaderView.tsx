import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { ZOOM_DEFAULTS } from '../../config';
import type { Anchor } from '../../core/anchors/types';
import type { DocumentRow, PositionRow } from '../../core/db/models';
import { annotationsRepo } from '../../core/db/repos';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { readPref, usePref } from '../../shared/hooks/usePref';
import { en } from '../../shared/i18n/en';
import { BookmarkIcon } from '../../shared/ui/icons';
import { toast } from '../../shared/ui/toast';
import { updateSettings, useSettings } from '../settings/useSettings';
import { PageFilters } from '../theme/PageFilters';
import { SyncPill } from '../sync/SyncPill';
import { ThemeMenu } from '../theme/ThemeMenu';
import { warmthColor } from '../theme/tokens';
import { useResolvedTheme } from '../theme/useTheme';
import { clearHistory, redo, undo } from './commands';
import { CheatSheet } from './CheatSheet';
import { FindBar } from './FindBar';
import { applyOverrides, route, type Action } from './keymap';
import { SheetHandle } from './SheetHandle';
import { applyColour, deleteOnSelection, LineActions, openNoteEditor, quickBookmark } from './LineActions';
import { adjacentBookmark, jumpToAnchor, READING_INSET_PX, readingLine, scrollToPoint } from './navigation';
import { Overlays } from './overlay/Overlays';
import {
  ensureVisible,
  extendCursor,
  moveCursor,
  useLineTap,
  useNativeSelection,
  useRegionSelect,
} from './selection/useLineSelection';
import { useReaderStore } from './store';
import { usePinch } from './gestures/usePinch';
import { usePageTheme } from './pageTheme';
import type { PointerKind } from './gestures/tap';
import type { PDFDocumentProxy } from './pdf/pdfjs';
import { createViewer, ZOOM_MAX, ZOOM_MIN, type PdfViewer, type Viewer } from './pdf/viewer';
import type { OutlineItem } from './sidebar/Outline';
import { Sidebar } from './sidebar/Sidebar';
import { useResume } from './useResume';

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const clamp = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

// PDF.js viewer is external mutable state: writes go through these helpers, not component scope
const setZoom = (v: PdfViewer, value: string) => void (v.currentScaleValue = value);
const rotate = (v: PdfViewer) => void (v.pagesRotation = (v.pagesRotation + 90) % 360); // view only (FR-RDR-09)

const SIDEBAR = ['open', 'closed'] as const;
const CYCLE = ['light', 'warm', 'dark'] as const; // Shift+T
const COLOUR_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const; // active highlight colour: device-local UI pref
const PRESET_VALUES = new Set(['page-width', 'page-fit', 'auto']);

function zoomStep(v: PdfViewer, dir: 1 | -1) {
  const cur = v.currentScale;
  const next = dir > 0 ? PRESETS.find((p) => p > cur + 0.01) : PRESETS.findLast((p) => p < cur - 0.01);
  if (next) v.currentScale = next;
}

/** Phones: hide bars on scroll down, show on scroll up / near the top (§10.3); blank taps toggle via useLineTap. */
function useAutoHideChrome(
  enabled: boolean,
  container: RefObject<HTMLDivElement | null>,
  setChrome: (fn: (c: boolean) => boolean) => void,
) {
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
    const onClick = (e: MouseEvent) => (e.target as Element).closest('.annotationLayer a') && setChrome(() => false); // reading mode after a link jump
    el.addEventListener('click', onClick);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
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
  const [rotation, setRotation] = useState(0);
  const [help, setHelp] = useState(false); // ? cheat sheet (FR-KEY-03)
  const [remote, setRemote] = useState<PositionRow | null>(null); // another device's newer point (FR-BKM-05)
  const [sideTab, setSideTab] = useState('pages');
  const [sheetFull, setSheetFull] = useState(false); // phones: panel bottom sheet height
  const themeTrigger = useRef<HTMLButtonElement>(null);
  const compact = useMediaQuery('(max-width: 767px)');
  const compactRef = useRef(compact);
  const lastPointer = useRef<PointerKind>('mouse');
  const selection = useReaderStore((s) => s.selection);
  const { palette, warmth, invertImages, keymap: overrides } = useSettings();
  const keymap = useMemo(() => applyOverrides(overrides), [overrides]); // FR-KEY-04
  const theme = useResolvedTheme();
  const [colourPref, setColourPref] = usePref('reader.colour', COLOUR_SLOTS, '1');
  const active = palette.find((p) => String(p.id) === colourPref)?.id ?? palette[0]?.id ?? 1;
  const setActive = useCallback((id: number) => setColourPref(COLOUR_SLOTS[id - 1] ?? '1'), [setColourPref]);
  const pages = pdf.numPages;
  const getViewer = useCallback(() => viewerRef.current, []); // stable: effects keyed on it must not re-run per render
  // reading slot = viewport top + chrome overlaying the page + 8 px (PRD §5); read from layout, so it stays stable
  const getInset = useCallback(() => {
    const bar = topBar.current;
    return bar && getComputedStyle(bar).position === 'absolute'
      ? bar.offsetHeight + READING_INSET_PX
      : READING_INSET_PX;
  }, []);

  useEffect(() => {
    let created: Viewer | undefined;
    let cancelled = false;
    void createViewer(container.current!, pdf, row.contentHash).then((v) => {
      if (cancelled) return v.destroy();
      created = v;
      v.eventBus.on('pagesinit', () => {
        v.viewer.currentScaleValue = readPref('reader.zoom', ZOOM_DEFAULTS, 'page-width'); // FR-SET-02; device-local, never synced
        container.current?.focus({ preventScroll: true }); // arrows/space scroll right away
        setPagesReady(true);
      });
      v.eventBus.on('pagechanging', (e: { pageNumber: number }) => setPage(e.pageNumber));
      v.eventBus.on('scalechanging', (e: { scale: number; presetValue?: string }) =>
        setScale({ value: e.scale, preset: e.presetValue }),
      );
      v.eventBus.on('rotationchanging', (e: { pagesRotation: number }) => setRotation(e.pagesRotation));
      viewerRef.current = v;
      setReady(true);
    });
    return () => {
      cancelled = true;
      viewerRef.current = null;
      created?.destroy();
    };
  }, [pdf, row.contentHash]);

  /** Quick bookmark (FR-BKM-01): the line cursor, else the reading line. */
  const bookmarkHere = useCallback(async () => {
    const v = viewerRef.current?.viewer;
    const el = container.current;
    const sel = useReaderStore.getState().selection;
    await quickBookmark(row.id, sel ?? (v && el ? await readingLine(pdf, row.contentHash, v, el, getInset()) : null));
  }, [pdf, row.id, row.contentHash, getInset]);

  /** `[` / `]`: previous / next bookmark from the reading line (FR-BKM-03). */
  const stepBookmark = useCallback(
    async (dir: 1 | -1) => {
      const v = viewerRef.current?.viewer;
      const el = container.current;
      if (!v || !el) return;
      const next = adjacentBookmark(await annotationsRepo.ofKind(row.id, 'bookmark'), v, el, dir, getInset());
      if (next) jumpToAnchor(v, el, next.anchor, getInset());
      else toast(dir > 0 ? en.reader.noNextBookmark : en.reader.noPrevBookmark);
    },
    [row.id, getInset],
  );

  // Keyboard: every shortcut goes through one router (FR-KEY-01/02, keymap.ts). `run` returns false when the key
  // does not apply right now (e.g. arrows without a line cursor), so the browser default still happens.
  useEffect(() => {
    const v = viewerRef.current?.viewer;
    if (!ready || !v) return;
    const run = (action: Action, key: string): boolean => {
      const store = useReaderStore.getState();
      const sel = store.selection;
      switch (action) {
        case 'clear':
          if (!sel) return false;
          store.select(null);
          window.getSelection()?.removeAllRanges();
          return true;
        case 'lineDown':
        case 'lineUp':
          if (sel?.kind !== 'line') return false; // with no cursor, arrows keep scrolling natively (FR-LIN-03)
          void moveCursor(pdf, row.contentHash, action === 'lineDown' ? 1 : -1).then((next) => {
            if (!next || !container.current) return;
            useReaderStore.getState().select(next);
            ensureVisible(v, container.current, next);
          });
          return true;
        case 'extendDown':
        case 'extendUp':
          if (sel?.kind !== 'line') return false; // with no cursor, Shift+arrows keep their default
          void extendCursor(pdf, row.contentHash, action === 'extendDown' ? 1 : -1).then((next) => {
            if (!next || !container.current) return;
            useReaderStore.getState().select(next);
            ensureVisible(v, container.current, next);
          });
          return true;
        case 'highlight':
          if (!sel) return false;
          void applyColour(row.id, active, palette, setActive);
          return true;
        case 'colour': {
          const swatch = palette[Number(key) - 1]; // the Nth swatch (ADR 0011)
          if (!swatch) return false;
          if (sel) void applyColour(row.id, swatch.id, palette, setActive);
          else {
            setActive(swatch.id);
            toast(en.reader.activeColour(swatch.label));
          }
          return true;
        }
        case 'note':
          if (!sel) return false;
          void openNoteEditor(row.id); // handled, so the N never lands in the textarea
          return true;
        case 'remove':
          if (!sel) return false;
          void deleteOnSelection(row.id);
          return true;
        case 'bookmark':
          void bookmarkHere();
          return true;
        case 'prevBookmark':
        case 'nextBookmark':
          void stepBookmark(action === 'nextBookmark' ? 1 : -1);
          return true;
        case 'undo':
        case 'redo':
          void (action === 'redo' ? redo() : undo()).catch(() => toast(en.reader.undoFailed));
          return true;
        case 'find':
          setFinding(true); // ours, not the browser's (FR-RDR-06)
          return true;
        case 'goToPage':
          pageInput.current?.focus();
          pageInput.current?.select();
          return true;
        case 'firstPage':
          v.currentPageNumber = 1;
          return true;
        case 'lastPage':
          v.currentPageNumber = v.pagesCount;
          return true;
        case 'nextPage':
          v.nextPage();
          return true;
        case 'prevPage':
          v.previousPage();
          return true;
        case 'sidebar':
          setSidebar((s) => (s === 'open' ? 'closed' : 'open'));
          return true;
        case 'themeMenu':
          themeTrigger.current?.click();
          return true;
        case 'cycleTheme': {
          const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length]!;
          void updateSettings({ theme: next });
          toast(en.theme.now(en.theme[next]));
          return true;
        }
        case 'zoomIn':
        case 'zoomOut':
          zoomStep(v, action === 'zoomIn' ? 1 : -1); // instead of the browser's page zoom
          return true;
        case 'zoomReset':
          v.currentScaleValue = 'page-width';
          return true;
        case 'help':
          setHelp((h) => !h);
          return true;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const hit = route(e, keymap);
      if (!hit || (help && hit.action !== 'help')) return; // the cheat sheet is modal
      if (run(hit.action, hit.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    keymap,
    ready,
    setSidebar,
    pdf,
    row.contentHash,
    row.id,
    palette,
    active,
    setActive,
    bookmarkHere,
    stepBookmark,
    theme,
    help,
  ]);

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

  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);
  useEffect(() => () => useReaderStore.setState({ selection: null, notes: null }), []); // selection/editor never outlive the reader
  useEffect(() => clearHistory(), [row.id]); // undo history is per document (FR-KEY-06)
  const onBlankTap = useCallback(() => compactRef.current && setChrome((c) => !c), []); // phones: tap blank toggles chrome
  useLineTap(ready, getViewer, container, pdf, row.contentHash, onBlankTap, lastPointer);
  useNativeSelection(ready, getViewer, container, pdf, row.contentHash, lastPointer);
  useRegionSelect(ready, getViewer, container);
  usePinch(ready, getViewer, container);
  usePageTheme(ready, getViewer, theme, invertImages);
  useAutoHideChrome(compact && ready, container, setChrome);
  useResume({
    pagesReady,
    getViewer,
    getInset,
    container,
    documentId: row.id,
    pdf,
    docHash: row.contentHash,
    onRemote: setRemote,
  });

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
  const jumpFromSidebar = (anchor: Anchor) => {
    const v = viewerRef.current?.viewer;
    if (v && container.current) jumpToAnchor(v, container.current, anchor, getInset());
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

  const zoomValue = scale.preset ?? PRESETS.find((p) => Math.abs(p - scale.value) < 0.005)?.toString() ?? 'custom';
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
  const slide = (hidden: string) =>
    `transition-transform duration-200 motion-reduce:transition-none ${showChrome ? '' : hidden}`;

  return (
    <div className={`relative flex h-dvh flex-col bg-ui-bg ${compact ? 'reader-compact' : ''}`}>
      <PageFilters />
      {/* focus inside a hidden bar (keyboard, screen reader) brings the chrome back */}
      <div
        ref={topBar}
        onFocus={() => setChrome(true)}
        className={compact ? `absolute inset-x-0 top-0 z-10 ${slide('-translate-y-full')}` : ''}
      >
        <header
          role="toolbar"
          aria-label={en.reader.toolbar}
          className="flex items-center gap-1 border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)] text-sm"
        >
          {!compact && sidebarToggle}
          <Link
            to="/"
            className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-ui-fg hover:bg-ui-bg"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">{en.reader.back}</span>
            <span className="sr-only sm:hidden">{en.reader.back}</span>
          </Link>
          <h1 className="mx-2 min-w-0 flex-1 truncate font-medium">{row.title}</h1>
          {!compact && (
            <>
              <button
                className={btn}
                aria-label={en.reader.prevPage}
                disabled={page <= 1}
                onClick={() => viewerRef.current?.viewer.previousPage()}
              >
                ‹
              </button>
              {pageField}
              <button
                className={btn}
                aria-label={en.reader.nextPage}
                disabled={page >= pages}
                onClick={() => viewerRef.current?.viewer.nextPage()}
              >
                ›
              </button>
              <button
                className={btn}
                aria-label={en.reader.zoomOut}
                onClick={() => viewerRef.current && zoomStep(viewerRef.current.viewer, -1)}
              >
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
                {zoomValue === 'custom' && (
                  <option value="custom">{en.reader.percent(Math.round(scale.value * 100))}</option>
                )}
              </select>
              <button
                className={btn}
                aria-label={en.reader.zoomIn}
                onClick={() => viewerRef.current && zoomStep(viewerRef.current.viewer, 1)}
              >
                +
              </button>
              <button
                className={btn}
                aria-label={en.reader.rotate}
                onClick={() => viewerRef.current && rotate(viewerRef.current.viewer)}
              >
                ⟳
              </button>
            </>
          )}
          <button
            className={btn}
            aria-label={en.reader.find}
            aria-expanded={finding}
            onClick={() => setFinding((f) => !f)}
          >
            ⌕
          </button>
          {!compact && <SyncPill />}
          {!compact && <ThemeMenu reader triggerRef={themeTrigger} />}
        </header>
        {finding && ready && <FindBar getViewer={getViewer} onClose={() => setFinding(false)} />}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {sidebar === 'open' && (
          <>
            {/* phones: bottom sheet over the page with a backdrop (§10.3, Appendix A); md+: docked column */}
            <button
              aria-label={en.common.close}
              className="fixed inset-0 z-20 bg-black/40 md:hidden"
              onClick={() => setSidebar('closed')}
            />
            <aside
              id="reader-sidebar"
              aria-label={en.reader.sidebar}
              className={
                compact
                  ? `fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl transition-[height] duration-200 motion-reduce:transition-none ${sheetFull ? 'h-[92dvh]' : 'h-[60dvh]'}`
                  : 'w-64 border-r border-line'
              }
            >
              {compact && <SheetHandle full={sheetFull} onFull={setSheetFull} onClose={() => setSidebar('closed')} />}
              <div className="h-full min-h-0 flex-1">
                <Sidebar
                  pdf={pdf}
                  documentId={row.id}
                  current={page}
                  onPage={goToFromSidebar}
                  onOutline={openOutline}
                  onJump={jumpFromSidebar}
                  tab={sideTab}
                  onTab={setSideTab}
                />
              </div>
            </aside>
          </>
        )}
        <div className="relative min-w-0 flex-1">
          <div ref={container} tabIndex={0} aria-label={row.title} className="reader-scroll outline-none">
            <div className="pdfViewer" />
          </div>
          {remote && (
            <div
              role="status"
              className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm text-ui-fg shadow-lg ${compact ? 'top-16' : 'top-2'}`}
            >
              <span className="whitespace-nowrap">
                {en.reader.continueFrom(remote.deviceLabel ?? en.reader.otherDevice, remote.page)}
              </span>
              <button
                className="min-h-9 rounded-full px-3 font-medium text-accent hover:bg-ui-bg"
                onClick={() => {
                  const v = viewerRef.current?.viewer;
                  const a = remote.anchor;
                  if (v && container.current) {
                    scrollToPoint(v, container.current, remote.page, a?.rects[0]?.y ?? 0, a?.rects[0]?.x, getInset());
                    if (a) useReaderStore.getState().markResume(a);
                  }
                  setRemote(null);
                }}
              >
                {en.reader.jump}
              </button>
              <button className="min-h-9 rounded-full px-3 hover:bg-ui-bg" onClick={() => setRemote(null)}>
                {en.reader.stay}
              </button>
            </div>
          )}
          {/* colour-temperature overlay over the reading area, never over chrome or popovers (FR-THM-03) */}
          {warmth > 0 && <div className="mg-warmth" aria-hidden="true" style={{ background: warmthColor(warmth) }} />}
          <Overlays
            ready={ready}
            getViewer={getViewer}
            container={container}
            pdf={pdf}
            documentId={row.id}
            docHash={row.contentHash}
            rotation={rotation}
            toolbar={
              selection && (
                <LineActions
                  documentId={row.id}
                  selection={selection}
                  palette={palette}
                  active={active}
                  setActive={setActive}
                  compact={compact}
                />
              )
            }
          />
        </div>
      </div>
      {compact && (
        <div
          role="toolbar"
          aria-label={en.reader.bottomBar}
          onFocus={() => setChrome(true)}
          // swipe up opens the annotation panel (Appendix A); the page field and scrubber keep their own drags.
          // The release usually lands above the bar, so it is watched on window for this one gesture.
          onPointerDown={(e) => {
            if ((e.target as Element).closest('input')) return;
            const y0 = e.clientY;
            const gesture = new AbortController();
            const opts = { once: true, signal: gesture.signal };
            window.addEventListener('pointercancel', () => gesture.abort(), opts);
            window.addEventListener(
              'pointerup',
              (u) => {
                gesture.abort();
                if (y0 - u.clientY > 40) {
                  setSideTab('annotations');
                  setSidebar('open');
                }
              },
              opts,
            );
          }}
          className={`absolute inset-x-0 bottom-0 z-10 flex touch-pan-x items-center gap-2 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] text-sm ${slide('translate-y-full')}`}
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
              const n = Number(e.target.value);
              setPage(n); // optimistic: fast key repeats must not step from a stale value before 'pagechanging'
              jumpTo(n); // scrubber (FR-RDR-02)
            }}
            className="min-h-11 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <button className={btn} aria-label={en.reader.quickBookmark} onClick={() => void bookmarkHere()}>
            <BookmarkIcon />
          </button>
          {sidebarToggle}
          <ThemeMenu reader triggerRef={themeTrigger} />
        </div>
      )}
      <CheatSheet open={help} onOpenChange={setHelp} keymap={keymap} />
    </div>
  );
}
