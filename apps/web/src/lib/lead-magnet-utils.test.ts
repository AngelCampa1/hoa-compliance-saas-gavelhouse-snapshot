import { describe, it, expect } from "vitest";
import { splitContentAtGate } from "./lead-magnet-utils";

describe("splitContentAtGate", () => {
  const twoSectionHtml = [
    "<h2>Section 1</h2>",
    "<p>Content for section 1.</p>",
    "<h2>Section 2</h2>",
    "<p>Content for section 2.</p>",
    "<h2>Section 3</h2>",
    "<p>Content for section 3.</p>",
  ].join("");

  it("splits at the Nth h2 boundary", () => {
    const result = splitContentAtGate(twoSectionHtml, 1);
    expect(result.teaser).toBe(
      "<h2>Section 1</h2><p>Content for section 1.</p>",
    );
    expect(result.gated).toBe(
      "<h2>Section 2</h2><p>Content for section 2.</p><h2>Section 3</h2><p>Content for section 3.</p>",
    );
  });

  it("splits at the 2nd h2 boundary", () => {
    const result = splitContentAtGate(twoSectionHtml, 2);
    expect(result.teaser).toBe(
      "<h2>Section 1</h2><p>Content for section 1.</p><h2>Section 2</h2><p>Content for section 2.</p>",
    );
    expect(result.gated).toBe(
      "<h2>Section 3</h2><p>Content for section 3.</p>",
    );
  });

  it("returns all content as teaser when freePreviewSections >= total sections", () => {
    const result = splitContentAtGate(twoSectionHtml, 5);
    expect(result.teaser).toBe(twoSectionHtml);
    expect(result.gated).toBe("");
  });

  it("returns empty teaser and all content as gated when freePreviewSections === 0", () => {
    const result = splitContentAtGate(twoSectionHtml, 0);
    expect(result.teaser).toBe("");
    expect(result.gated).toBe(twoSectionHtml);
  });

  it("falls back to paragraph splitting when there are no headings", () => {
    const noHeadings =
      "<p>Paragraph 1.</p><p>Paragraph 2.</p><p>Paragraph 3.</p>";
    const result = splitContentAtGate(noHeadings, 2);
    expect(result.teaser).toBe("<p>Paragraph 1.</p><p>Paragraph 2.</p>");
    expect(result.gated).toBe("<p>Paragraph 3.</p>");
  });

  it("handles paragraph fallback with freePreviewSections >= total paragraphs", () => {
    const noHeadings = "<p>Paragraph 1.</p><p>Paragraph 2.</p>";
    const result = splitContentAtGate(noHeadings, 5);
    expect(result.teaser).toBe(noHeadings);
    expect(result.gated).toBe("");
  });

  it("handles paragraph fallback with freePreviewSections === 0", () => {
    const noHeadings = "<p>Paragraph 1.</p><p>Paragraph 2.</p>";
    const result = splitContentAtGate(noHeadings, 0);
    expect(result.teaser).toBe("");
    expect(result.gated).toBe(noHeadings);
  });

  it("falls back to h3 when there are no h2 headings but h3 exist", () => {
    const h3Only = [
      "<h3>Sub 1</h3>",
      "<p>Content 1.</p>",
      "<h3>Sub 2</h3>",
      "<p>Content 2.</p>",
      "<h3>Sub 3</h3>",
      "<p>Content 3.</p>",
    ].join("");
    const result = splitContentAtGate(h3Only, 1);
    expect(result.teaser).toBe("<h3>Sub 1</h3><p>Content 1.</p>");
    expect(result.gated).toBe(
      "<h3>Sub 2</h3><p>Content 2.</p><h3>Sub 3</h3><p>Content 3.</p>",
    );
  });

  it("splits on h2 even when h3 headings are also present", () => {
    const mixed = [
      "<h2>Section 1</h2>",
      "<h3>Sub A</h3>",
      "<p>Content.</p>",
      "<h2>Section 2</h2>",
      "<p>More content.</p>",
    ].join("");
    const result = splitContentAtGate(mixed, 1);
    expect(result.teaser).toBe(
      "<h2>Section 1</h2><h3>Sub A</h3><p>Content.</p>",
    );
    expect(result.gated).toBe("<h2>Section 2</h2><p>More content.</p>");
  });

  it("handles content with leading text before first heading", () => {
    const withLeadIn =
      "<p>Intro text.</p><h2>Section 1</h2><p>Body.</p><h2>Section 2</h2><p>More.</p>";
    const result = splitContentAtGate(withLeadIn, 1);
    expect(result.teaser).toBe(
      "<p>Intro text.</p><h2>Section 1</h2><p>Body.</p>",
    );
    expect(result.gated).toBe("<h2>Section 2</h2><p>More.</p>");
  });

  it("handles empty HTML string", () => {
    const result = splitContentAtGate("", 2);
    expect(result.teaser).toBe("");
    expect(result.gated).toBe("");
  });

  it("handles HTML without headings or paragraphs", () => {
    const result = splitContentAtGate("<div>Just a div</div>", 1);
    expect(result.teaser).toBe("<div>Just a div</div>");
    expect(result.gated).toBe("");
  });
});
