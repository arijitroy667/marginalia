import { Tabs } from 'radix-ui';
import { useEffect, useState } from 'react';
import type { Anchor } from '../../../core/anchors/types';
import { en } from '../../../shared/i18n/en';
import type { PDFDocumentProxy } from '../pdf/pdfjs';
import { Annotations } from './Annotations';
import { Outline, type OutlineItem } from './Outline';
import { revokeThumbnails, Thumbnails } from './Thumbnails';

const tab =
  'min-h-11 flex-1 border-b-2 border-transparent px-3 text-sm text-muted data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-ui-fg';

interface Props {
  pdf: PDFDocumentProxy;
  documentId: string;
  current: number;
  onPage: (n: number) => void;
  onOutline: (item: OutlineItem) => void;
  onJump: (anchor: Anchor) => void;
  tab: string;
  onTab: (tab: string) => void;
}

/** Pages (thumbnails), Contents (outline) and the annotation panel (FR-RDR-04/05, FR-PNL-01). */
export function Sidebar({ pdf, documentId, current, onPage, onOutline, onJump, tab: active, onTab }: Props) {
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [aspect, setAspect] = useState(1.3);

  useEffect(() => {
    let alive = true;
    void pdf.getOutline().then((o) => alive && setOutline(o ?? []));
    void pdf.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      if (alive) setAspect(v.height / v.width);
    });
    return () => {
      alive = false;
      revokeThumbnails(pdf);
    };
  }, [pdf]);

  return (
    <Tabs.Root value={active} onValueChange={onTab} className="flex h-full flex-col bg-surface">
      <Tabs.List aria-label={en.reader.sidebar} className="flex border-b border-line">
        <Tabs.Trigger value="pages" className={tab}>
          {en.reader.pages}
        </Tabs.Trigger>
        {outline.length > 0 && ( // hidden if the PDF has no outline (FR-RDR-05)
          <Tabs.Trigger value="contents" className={tab}>
            {en.reader.contents}
          </Tabs.Trigger>
        )}
        <Tabs.Trigger value="annotations" className={tab}>
          {en.reader.annotations}
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="pages" className="min-h-0 flex-1 overflow-auto outline-none">
        <Thumbnails pdf={pdf} current={current} aspect={aspect} onSelect={onPage} />
      </Tabs.Content>
      <Tabs.Content value="contents" className="min-h-0 flex-1 overflow-auto p-2 outline-none">
        <Outline items={outline} onNavigate={onOutline} />
      </Tabs.Content>
      <Tabs.Content value="annotations" className="min-h-0 flex-1 outline-none">
        <Annotations documentId={documentId} onJump={onJump} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
