import { describe, it, expect } from "vitest";
import { extractToc } from "./extract-toc.js";

describe("extractToc", () => {
  it("returns empty array for empty string", () => {
    expect(extractToc("")).toEqual([]);
  });

  it("returns empty array when no h2 headings", () => {
    const md = "# Title\n\nSome body.\n\n### Deeper\n\nMore body.";
    expect(extractToc(md)).toEqual([]);
  });

  it("extracts h2 headings only, ignoring h1/h3+", () => {
    const md = [
      "# H1 skip",
      "## First Section",
      "body",
      "### H3 skip",
      "## Second Section",
      "#### H4 skip",
    ].join("\n");
    expect(extractToc(md)).toEqual([
      { level: 2, text: "First Section", slug: "first-section" },
      { level: 2, text: "Second Section", slug: "second-section" },
    ]);
  });

  it("slugifies special characters, punctuation, and collapses whitespace", () => {
    const md = [
      "## What's This? A Test!",
      "## Hello, World -- 50% Funded",
      "##   Trim   Me",
    ].join("\n");
    expect(extractToc(md)).toEqual([
      { level: 2, text: "What's This? A Test!", slug: "whats-this-a-test" },
      {
        level: 2,
        text: "Hello, World -- 50% Funded",
        slug: "hello-world-50-funded",
      },
      { level: 2, text: "Trim   Me", slug: "trim-me" },
    ]);
  });

  it("deduplicates repeated slugs by appending a counter", () => {
    const md = ["## Overview", "## Overview", "## Overview"].join("\n");
    const toc = extractToc(md);
    expect(toc.map((t) => t.slug)).toEqual([
      "overview",
      "overview-2",
      "overview-3",
    ]);
  });

  it("ignores ## inside fenced code blocks", () => {
    const md = [
      "## Real Section",
      "",
      "```md",
      "## Not A Heading",
      "```",
      "",
      "## Another Real",
    ].join("\n");
    expect(extractToc(md).map((t) => t.text)).toEqual([
      "Real Section",
      "Another Real",
    ]);
  });
});
