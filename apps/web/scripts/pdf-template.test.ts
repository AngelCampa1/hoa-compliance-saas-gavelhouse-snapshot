import { describe, it, expect } from "vitest";
import { renderPdfHtml } from "./pdf-template.js";

const baseInput = {
  title: "Reserve Fund <Health> Guide",
  description: 'A description with "quotes" & ampersands',
  bluf: "Short bottom line.",
  publishedAt: "2026-04-01",
  bodyHtml: "<p>Body content.</p>",
  toc: [
    { level: 2 as const, text: "First", slug: "first" },
    { level: 2 as const, text: "Second & More", slug: "second-more" },
  ],
};

describe("renderPdfHtml", () => {
  it("renders a full HTML document with required sections", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('class="cover"');
    expect(html).toContain('class="toc"');
    expect(html).toContain('class="body"');
    expect(html).toContain('class="back"');
    expect(html).toContain("Start your 30-day free trial");
    expect(html).toContain(
      "No credit card required. Add billing before the trial ends to keep access.",
    );
    expect(html).toContain("gavelhouse.app");
  });

  it("escapes HTML in title, description, bluf, and toc text", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toContain("Reserve Fund &lt;Health&gt; Guide");
    expect(html).toContain("&quot;quotes&quot;");
    expect(html).toContain("&amp; ampersands");
    expect(html).toContain("Second &amp; More");
    // Raw < from the escaped title should not appear as a live tag.
    expect(html).not.toContain("<Health>");
  });

  it("formats the published date as Month D, YYYY", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toContain("April 1, 2026");
  });

  it("preserves the provided bodyHtml verbatim", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toContain("<p>Body content.</p>");
  });

  it("renders numbered TOC entries", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("First");
  });

  it("renders an empty-state TOC when no sections", () => {
    const html = renderPdfHtml({ ...baseInput, toc: [] });
    expect(html).toContain("This document has no sections.");
    // No rendered <ol> list when TOC is empty.
    expect(html).not.toContain('<ol class="toc-list">');
  });

  it("falls back to raw string for malformed date", () => {
    const html = renderPdfHtml({ ...baseInput, publishedAt: "not-a-date" });
    expect(html).toContain("not-a-date");
  });

  it("includes A4 @page rule and print-friendly CSS", () => {
    const html = renderPdfHtml(baseInput);
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("page-break-before: always");
    expect(html).toContain("page-break-inside: avoid");
  });
});
