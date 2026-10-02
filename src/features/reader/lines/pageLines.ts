/**
 * PageLines for a page: memory LRU (50 pages) -> Dexie lineCache -> PDF.js textContent + Line Engine
 * (PRD §8.5, NFR-PERF-07). Never throws: on failure it yields null and native selection keeps working (FR-LIN-07).
 */
import { buildPageLines, ENGINE_VERSION, type PageLines } from '../../../core/line-engine';
import { lineCacheRepo } from '../../../core/db/repos';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import { itemsFromTextContent } from './textItems';

const LRU_SIZE = 50;
const lru = new Map<string, Promise<PageLines | null>>();

const isPageLines = (d: unknown): d is PageLines =>
  typeof d === 'object' && d !== null && (d as PageLines).engineVersion === ENGINE_VERSION && Array.isArray((d as PageLines).lines);

export function getPageLines(pdf: Pick<PDFDocumentProxy, 'getPage'>, docHash: string, page: number): Promise<PageLines | null> {
  const key = `${docHash}:${page}:${ENGINE_VERSION}`;
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key); // refresh recency
    lru.set(key, hit);
    return hit;
  }
  const job = (async () => {
    try {
      const cached = await lineCacheRepo.get(docHash, page, ENGINE_VERSION).catch(() => undefined);
      if (isPageLines(cached)) return cached;
      const p = await pdf.getPage(page);
      const vp = p.getViewport({ scale: 1 });
      const pl = buildPageLines(page, itemsFromTextContent(await p.getTextContent(), vp), { width: vp.width, height: vp.height });
      void lineCacheRepo.put(docHash, page, ENGINE_VERSION, pl).catch(() => undefined); // cache is best-effort
      return pl;
    } catch {
      lru.delete(key); // let a later call retry
      return null;
    }
  })();
  lru.set(key, job);
  if (lru.size > LRU_SIZE) lru.delete(lru.keys().next().value!);
  return job;
}
