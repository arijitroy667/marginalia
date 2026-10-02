import type { CSSProperties, ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../utils/markdown';

function inline(nodes: Inline[], key = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'strong':
        return <strong key={k}>{inline(n.c, k)}</strong>;
      case 'em':
        return <em key={k}>{inline(n.c, k)}</em>;
      case 'code':
        return (
          <code key={k} className="rounded bg-ui-bg px-1 font-mono text-[0.9em]">
            {n.v}
          </code>
        );
      case 'link':
        return (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
            {inline(n.c, k)}
          </a>
        );
    }
  });
}

/** Renders note Markdown as React elements only: never HTML strings, never `dangerouslySetInnerHTML` (NFR-SEC-05). */
export function Markdown({
  source,
  className = '',
  style,
}: {
  source: string;
  className?: string;
  style?: CSSProperties | undefined;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`} style={style}>
      {parseMarkdown(source).map((b, i) => {
        if (b.t === 'p')
          return (
            <p key={i} className="whitespace-pre-wrap">
              {inline(b.c)}
            </p>
          );
        if (b.t === 'pre')
          return (
            <pre key={i} className="overflow-x-auto rounded bg-ui-bg p-2 font-mono text-xs">
              {b.v}
            </pre>
          );
        const items = b.items.map((it, j) => <li key={j}>{inline(it)}</li>);
        return b.t === 'ul' ? (
          <ul key={i} className="list-disc pl-5">
            {items}
          </ul>
        ) : (
          <ol key={i} className="list-decimal pl-5">
            {items}
          </ol>
        );
      })}
    </div>
  );
}
