import type { PDFDocumentProxy } from '../pdf/pdfjs';

export type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number];

/** Nested table of contents from getOutline() (FR-RDR-05). */
export function Outline({ items, onNavigate }: { items: OutlineItem[]; onNavigate: (item: OutlineItem) => void }) {
  return (
    <ul className="flex flex-col">
      {items.map((item, i) => (
        <li key={i}>
          <button
            onClick={() => onNavigate(item)}
            className={`block min-h-9 w-full rounded px-2 py-1 text-left text-sm hover:bg-ui-bg ${item.bold ? 'font-semibold' : ''} ${item.italic ? 'italic' : ''}`}
          >
            {item.title}
          </button>
          {item.items.length > 0 && (
            <div className="ml-3 border-l border-line pl-1">
              <Outline items={item.items} onNavigate={onNavigate} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
