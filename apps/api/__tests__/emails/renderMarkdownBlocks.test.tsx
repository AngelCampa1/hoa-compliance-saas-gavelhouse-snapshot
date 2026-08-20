import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdownBlocks } from "../../src/emails/lib/renderMarkdownBlocks.js";

function html(md: string): string {
  return renderToStaticMarkup(<>{renderMarkdownBlocks(md)}</>);
}

describe("renderMarkdownBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    const out = html("hello\n\nworld");
    expect(out).toContain("<p");
    expect(out).toContain("hello");
    expect(out).toContain("world");
    // two paragraphs
    expect(out.match(/<p/g)?.length).toBe(2);
  });

  it("renders bold via **text**", () => {
    const out = html("this is **bold** text");
    expect(out).toContain("<strong>bold</strong>");
  });

  it("renders links via [text](url)", () => {
    const out = html("see [Gavelhouse](https://gavelhouse.app) today");
    expect(out).toContain('href="https://gavelhouse.app"');
    expect(out).toContain(">Gavelhouse<");
  });

  it("escapes raw HTML in plain text", () => {
    const out = html("watch <script>alert(1)</script> yourself");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes HTML inside bold segment", () => {
    const out = html("**<b>x</b>**");
    expect(out).not.toContain("<b>x</b>");
    expect(out).toContain("&lt;b&gt;");
  });

  it("escapes HTML inside link text", () => {
    const out = html("[<x>](https://gavelhouse.app)");
    expect(out).toContain("&lt;x&gt;");
  });

  it("returns no paragraphs for empty input", () => {
    const out = html("");
    expect(out).toBe("");
  });

  it("handles mixed bold and links", () => {
    const out = html("**bold** then [link](https://gavelhouse.app/a) end");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://gavelhouse.app/a"');
  });

  it("renders javascript: links as plain text, never as an anchor", () => {
    const out = html("click [me](javascript:alert(1)) please");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("me");
  });

  it("renders mailto: links as plain text (http/s only allow-list)", () => {
    const out = html("email [us](mailto:hi@gavelhouse.app) today");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("mailto:");
    expect(out).toContain("us");
  });

  it("renders data: links as plain text", () => {
    const out = html("bad [link](data:text/html,x) here");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("data:text/html");
  });

  it("still renders http:// links as anchors", () => {
    const out = html("see [plain](http://example.com) here");
    expect(out).toContain('href="http://example.com"');
  });
});
