import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("rss.xml source regressions", () => {
  it("includes product and solution collections in the feed source", () => {
    const source = readFileSync("src/pages/rss.xml.ts", "utf8");

    expect(source).toContain('getCollection("product-pages")');
    expect(source).toContain('getCollection("solutions")');
    expect(source).toContain("canonicalPageUrl(siteUrl, `/product/${e.id}`)");
    expect(source).toContain("canonicalPageUrl(siteUrl, `/solutions/${e.id}`)");
  });

  it("uses canonical trailing-slash URLs for collection feed item links", () => {
    const source = readFileSync("src/pages/rss.xml.ts", "utf8");

    expect(source).toContain(
      'import { canonicalPageUrl } from "../lib/canonical-url"',
    );
    expect(source).toContain("canonicalPageUrl(");
    expect(source).not.toContain("`${siteUrl}/resources/guides/${e.id}`");
    expect(source).not.toContain("`${siteUrl}/product/${e.id}`");
  });
});
