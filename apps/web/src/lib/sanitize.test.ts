import { describe, it, expect } from "vitest";
import {
  sanitizeJsonLd,
  sanitizeHref,
  sanitizeExcerpt,
  sanitizeHtml,
} from "./sanitize";

describe("sanitizeJsonLd", () => {
  it("returns normal text unchanged", () => {
    expect(sanitizeJsonLd("hello world")).toBe("hello world");
  });

  it("escapes lowercase </script> sequence", () => {
    const result = sanitizeJsonLd('{"name": "</script><script>evil()"}');
    expect(result).not.toContain("</script>");
    expect(result).toContain("<\\/script");
  });

  it("escapes uppercase </SCRIPT> sequence (case-insensitive)", () => {
    const result = sanitizeJsonLd("</SCRIPT>");
    expect(result).not.toContain("</SCRIPT>");
    expect(result).toContain("<\\/SCRIPT");
  });

  it("escapes mixed-case </Script> sequence", () => {
    const result = sanitizeJsonLd("</Script>");
    expect(result).not.toContain("</Script>");
    expect(result).toContain("<\\/Script");
  });

  it("strips null byte control character (\\u0000)", () => {
    expect(sanitizeJsonLd("foo\u0000bar")).toBe("foobar");
  });

  it("strips low control characters (\\u0001-\\u001F)", () => {
    expect(sanitizeJsonLd("a\u0001b\u001Fc")).toBe("abc");
  });

  it("strips DEL character (\\u007F)", () => {
    expect(sanitizeJsonLd("a\u007Fb")).toBe("ab");
  });

  it("strips C1 control characters (\\u0080-\\u009F)", () => {
    expect(sanitizeJsonLd("a\u0080b\u009Fc")).toBe("abc");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeJsonLd("")).toBe("");
  });

  it("does not modify normal unicode (emoji, accented chars)", () => {
    expect(sanitizeJsonLd("café 🎉")).toBe("café 🎉");
  });

  it("handles multiple </script> occurrences", () => {
    const result = sanitizeJsonLd("</script></script>");
    expect(result).toBe("<\\/script><\\/script>");
  });

  it("makes JSON.stringified schema safe when a value contains </script>", () => {
    const schema = {
      "@type": "Thing",
      name: 'Legit name </script><script>alert("xss")</script>',
    };
    const serialized = JSON.stringify(schema);
    const result = sanitizeJsonLd(serialized);
    expect(result).not.toContain("</script>");
    expect(result).toContain("<\\/script>");
    // Must still be parseable after the escape sequences are in a JS string context
    expect(result).toContain('"@type":"Thing"');
  });
});

describe("sanitizeHref", () => {
  it("returns '#' for empty string", () => {
    expect(sanitizeHref("")).toBe("#");
  });

  it("returns '#' for javascript: URI", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBe("#");
  });

  it("returns '#' for JAVASCRIPT: URI (uppercase)", () => {
    expect(sanitizeHref("JAVASCRIPT:alert(1)")).toBe("#");
  });

  it("returns '#' for vbscript: URI", () => {
    expect(sanitizeHref("vbscript:msgbox(1)")).toBe("#");
  });

  it("returns '#' for data: URI", () => {
    expect(sanitizeHref("data:text/html,<h1>hi</h1>")).toBe("#");
  });

  it("returns '#' for protocol-relative URL (//example.com)", () => {
    expect(sanitizeHref("//example.com")).toBe("#");
  });

  it("allows http:// URL", () => {
    expect(sanitizeHref("http://example.com")).toBe("http://example.com");
  });

  it("allows https:// URL", () => {
    expect(sanitizeHref("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("allows absolute relative URL starting with /", () => {
    expect(sanitizeHref("/about")).toBe("/about");
  });

  it("allows relative URL starting with ./", () => {
    expect(sanitizeHref("./relative")).toBe("./relative");
  });

  it("allows fragment-only URL starting with #", () => {
    expect(sanitizeHref("#section-1")).toBe("#section-1");
  });

  it("returns '#' for malformed URL that is not relative", () => {
    expect(sanitizeHref("not a url at all!!!")).toBe("#");
  });

  it("returns '#' for ftp: protocol", () => {
    expect(sanitizeHref("ftp://files.example.com")).toBe("#");
  });

  it("allows root path'/'", () => {
    expect(sanitizeHref("/")).toBe("/");
  });
});

describe("sanitizeExcerpt (from sanitize.ts)", () => {
  it("passes through plain text unchanged", () => {
    expect(sanitizeExcerpt("plain text")).toBe("plain text");
  });

  it("preserves <mark> tags with their content", () => {
    expect(sanitizeExcerpt("foo <mark>bar</mark> baz")).toBe(
      "foo <mark>bar</mark> baz",
    );
  });

  it("strips non-mark HTML tags entirely (img with onerror)", () => {
    const result = sanitizeExcerpt('<img src=x onerror="alert(1)">text');
    expect(result).not.toContain("<img");
    expect(result).toContain("text");
  });

  it("strips script tags", () => {
    const result = sanitizeExcerpt("<script>evil()</script>safe");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("safe");
  });

  it("strips svg/script nested tags", () => {
    const result = sanitizeExcerpt("<svg><script>alert(1)</script></svg>text");
    expect(result).not.toContain("<svg>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("text");
  });

  it("replaces javascript: protocol references with empty string", () => {
    const result = sanitizeExcerpt("click javascript:alert(1) here");
    expect(result).not.toContain("javascript:");
  });

  it("handles empty string", () => {
    expect(sanitizeExcerpt("")).toBe("");
  });

  it("preserves multiple <mark> tags", () => {
    const result = sanitizeExcerpt(
      "<mark>first</mark> and <mark>second</mark>",
    );
    expect(result).toBe("<mark>first</mark> and <mark>second</mark>");
  });

  it("handles <mark> mixed with non-mark tags", () => {
    const result = sanitizeExcerpt("<span>ignored</span> <mark>kept</mark>");
    expect(result).not.toContain("<span>");
    expect(result).toContain("<mark>kept</mark>");
  });

  it("strips attributes from <mark> opening tag", () => {
    const result = sanitizeExcerpt('<mark onerror="alert(1)">text</mark>');
    expect(result).not.toContain("onerror");
    expect(result).toContain("<mark>text</mark>");
  });

  it("strips attributes from </mark> closing tag", () => {
    const result = sanitizeExcerpt('<mark>text</mark onerror="x">');
    expect(result).not.toContain("onerror");
    expect(result).toContain("text");
  });

  it("removes javascript: protocol inside <mark> content", () => {
    const result = sanitizeExcerpt(
      "<mark>visit javascript:alert(1) here</mark>",
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("<mark>");
    expect(result).toContain("</mark>");
  });
});

describe("sanitizeHtml", () => {
  it("returns safe HTML unchanged", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("strips script tags and their content", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(sanitizeHtml(html)).toBe("<p>Hello</p><p>World</p>");
  });

  it("strips script tags case-insensitively", () => {
    const html = '<SCRIPT>alert("xss")</SCRIPT>';
    expect(sanitizeHtml(html)).toBe("");
  });

  it("strips iframe tags and their content", () => {
    const html =
      '<p>Before</p><iframe src="https://evil.com"></iframe><p>After</p>';
    expect(sanitizeHtml(html)).toBe("<p>Before</p><p>After</p>");
  });

  it("strips self-closing script tags", () => {
    const html = '<p>Hello</p><script src="evil.js" /><p>World</p>';
    expect(sanitizeHtml(html)).toBe("<p>Hello</p><p>World</p>");
  });

  it("strips on* event handler attributes", () => {
    const html = '<img src="photo.jpg" onerror="alert(1)" />';
    expect(sanitizeHtml(html)).not.toContain("onerror");
    expect(sanitizeHtml(html)).toContain("photo.jpg");
  });

  it("strips javascript: URIs in href attributes", () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="#"');
  });

  it("strips object and embed tags", () => {
    const html =
      '<object data="evil.swf">content</object><embed src="evil.swf" />';
    expect(sanitizeHtml(html)).toBe("");
  });

  it("strips form tags and their content", () => {
    const html = '<form action="https://evil.com"><input /></form>';
    expect(sanitizeHtml(html)).toBe("");
  });
});
