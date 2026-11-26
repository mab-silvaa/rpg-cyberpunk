import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@vtt/shared";

function renderInline(items: Inline[]): ReactNode[] {
  return items.map((item, i) => {
    switch (item.type) {
      case "text":
        return item.text;
      case "bold":
        return <strong key={i}>{renderInline(item.children)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(item.children)}</em>;
      case "code":
        return <code key={i}>{item.text}</code>;
      case "link":
        return (
          <a key={i} href={item.href} target="_blank" rel="noopener noreferrer">
            {renderInline(item.children)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5";
      return <Tag key={i}>{renderInline(block.children)}</Tag>;
    }
    case "paragraph":
      return <p key={i}>{renderInline(block.children)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return <blockquote key={i}>{renderInline(block.children)}</blockquote>;
    case "code":
      return (
        <pre key={i}>
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr key={i} />;
  }
}

/** Mostra Markdown sem nunca montar HTML a partir do texto. */
export function Markdown({ source }: { source: string }) {
  return <div className="markdown">{parseMarkdown(source).map(renderBlock)}</div>;
}
