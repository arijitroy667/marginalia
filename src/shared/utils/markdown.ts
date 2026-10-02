/**
 * Note Markdown (FR-NOT-05): the subset the PRD names — bold, italic, inline code, links, lists, code blocks,
 * paragraphs. Parsed into a tiny AST that the UI turns into React elements, so raw HTML in a note is only ever
 * text (NFR-SEC-05). Links are kept only for http(s) and mailto; anything else stays literal text.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block = { t: 'p'; c: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] } | { t: 'pre'; v: string };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const WORD = /[\p{L}\p{N}]/u;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    const intraword = i > 0 && WORD.test(s[i - 1]!); // snake_case stays text
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ t: 'code', v: m[1]! });
    } else if ((m = rest.match(/^\*\*(\S(?:.*?\S)?)\*\*/) ?? (intraword ? null : rest.match(/^__(\S(?:.*?\S)?)__/)))) {
      flush();
      out.push({ t: 'strong', c: parseInline(m[1]!) });
    } else if (
      (m =
        rest.match(/^\*(\S(?:[^*]*?\S)?)\*/) ??
        (intraword ? null : rest.match(/^_(\S(?:[^_]*?\S)?)_(?![\p{L}\p{N}])/u)))
    ) {
      flush();
      out.push({ t: 'em', c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)) && SAFE_URL.test(m[2]!)) {
      flush();
      out.push({ t: 'link', href: m[2]!, c: parseInline(m[1]!) });
    } else {
      text += s[i];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) code.push(lines[i]!);
      blocks.push({ t: 'pre', v: code.join('\n') });
      continue;
    }
    const item = line.match(/^\s*[-*+]\s+(.*)$/) ?? line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (item) {
      flush();
      const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
      const last = blocks.at(-1);
      if (last?.t === kind) last.items.push(parseInline(item[1]!));
      else blocks.push({ t: kind, items: [parseInline(item[1]!)] });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return blocks;
}
