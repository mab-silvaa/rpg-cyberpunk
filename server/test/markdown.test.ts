import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "@vtt/shared";

describe("markdown das notas", () => {
  it("lê títulos, parágrafos, listas, citação, código e linha", () => {
    const blocks = parseMarkdown(
      [
        "# Cena 1",
        "Texto em",
        "duas linhas.",
        "",
        "- um",
        "- dois",
        "",
        "1. primeiro",
        "2) segundo",
        "",
        "> citação",
        "---",
        "```",
        "a *b*",
        "```",
        "## Sub",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "rule",
      "code",
      "heading",
    ]);
    expect(blocks[1]).toMatchObject({
      children: [{ type: "text", text: "Texto em duas linhas." }],
    });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[{ text: "um" }], [{ text: "dois" }]],
    });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[6]).toEqual({ type: "code", text: "a *b*" });
  });

  it("lê negrito, itálico, código e links", () => {
    expect(parseInline("a **b** *c* _d_ `e*f*` [x](https://exemplo.com)")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "d" }] },
      { type: "text", text: " " },
      { type: "code", text: "e*f*" },
      { type: "text", text: " " },
      { type: "link", href: "https://exemplo.com", children: [{ type: "text", text: "x" }] },
    ]);
  });

  it("HTML e scripts ficam como texto, nunca como marcação", () => {
    const out = parseMarkdown("<script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(out).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "<script>alert(1)</script> <img src=x onerror=alert(1)>" },
        ],
      },
    ]);
  });

  it("só links http e https viram link", () => {
    expect(safeHref("https://a.com/x?y=1")).toBe("https://a.com/x?y=1");
    expect(safeHref("http://a.com")).toBe("http://a.com");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//a.com",
      "ftp://a.com",
      'https://a.com/"x',
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
    expect(parseInline("[clique](javascript:alert(1))")).toEqual([
      { type: "text", text: "clique)" },
    ]);
  });

  it("não trava com textos estranhos nem com aninhamento fundo", () => {
    const evil = "*".repeat(5000) + "_".repeat(5000) + "[".repeat(2000) + "`".repeat(2000);
    expect(() => parseMarkdown(evil)).not.toThrow();
    expect(() => parseMarkdown("**".repeat(400) + "a" + "**".repeat(400))).not.toThrow();
    expect(parseMarkdown("")).toEqual([]);
  });
});
