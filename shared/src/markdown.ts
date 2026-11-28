/** Markdown mínimo, sem HTML: o resultado é uma árvore de dados, então nada do texto vira marcação. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "rule" };

const MAX_INLINE_DEPTH = 4;

/** Só aceita links http e https. */
export const safeHref = (href: string): string | null =>
  /^https?:\/\/[^\s<>"']+$/i.test(href) ? href : null;

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = (): void => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let match: RegExpExecArray | null;
    if ((match = /^`([^`\n]+)`/.exec(rest))) {
      flush();
      out.push({ type: "code", text: match[1]! });
      i += match[0].length;
    } else if (depth < MAX_INLINE_DEPTH && (match = /^\*\*(?=\S)(.+?)(?<=\S)\*\*/.exec(rest))) {
      flush();
      out.push({ type: "bold", children: parseInline(match[1]!, depth + 1) });
      i += match[0].length;
    } else if (
      depth < MAX_INLINE_DEPTH &&
      (match = /^(?:\*(?=[^\s*])(.+?)(?<=[^\s*])\*|_(?=[^\s_])(.+?)(?<=[^\s_])_)/.exec(rest))
    ) {
      flush();
      out.push({ type: "italic", children: parseInline((match[1] ?? match[2])!, depth + 1) });
      i += match[0].length;
    } else if ((match = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest))) {
      const href = safeHref(match[2]!);
      if (href) {
        flush();
        out.push({ type: "link", href, children: parseInline(match[1]!, depth + 1) });
      } else {
        // Link inseguro (javascript:, data: ...) vira texto simples.
        buffer += match[1]!;
      }
      i += match[0].length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let match: RegExpExecArray | null;

    if (/^```/.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      blocks.push({ type: "code", text: code.join("\n") });
    } else if (line.trim() === "") {
      flushParagraph();
    } else if ((match = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: match[1]!.length as 1 | 2 | 3,
        children: parseInline(match[2]!.trim()),
      });
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "rule" });
    } else if ((match = /^>\s?(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push({ type: "quote", children: parseInline(match[1]!) });
    } else if ((match = /^(?:[-*]\s+|(\d+)[.)]\s+)(.*)$/.exec(line))) {
      flushParagraph();
      const ordered = match[1] !== undefined;
      const items: Inline[][] = [parseInline(match[2]!)];
      while (i + 1 < lines.length) {
        const next = /^(?:[-*]\s+|(\d+)[.)]\s+)(.*)$/.exec(lines[i + 1]!);
        if (!next || (next[1] !== undefined) !== ordered) break;
        items.push(parseInline(next[2]!));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}
