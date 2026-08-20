import { describe, expect, it } from "vitest";

import { canonicalPagePath, canonicalPageUrl } from "./canonical-url";

describe("canonicalPagePath", () => {
  it("strips Astro content .md ids and adds page trailing slashes", () => {
    expect(canonicalPagePath("/resources/guides/guide-a.md")).toBe("/resources/guides/guide-a/",
    );
  });

  it("adds a leading slash for relative page paths", () => {
    expect(canonicalPagePath("product/gavelhouse")).toBe("/product/gavelhouse/",
    );
  });

  it("preserves extension-bearing utility file paths", () => {
    expect(canonicalPagePath("/pricing.txt")).toBe("/pricing.txt");
  });

  it("preserves query strings on canonical page paths", () => {
    expect(canonicalPagePath("/resources/guides/guide-a.md?ref=feed")).toBe("/resources/guides/guide-a/?ref=feed",
    );
  });

  it("keeps the root path canonical", () => {
    expect(canonicalPagePath("/")).toBe("/");
  });
});

describe("canonicalPageUrl", () => {
  it("joins site URLs and canonical page paths", () => {
    expect(
      canonicalPageUrl("https://gavelhouse.app/","/compare/versus/foo.md"),
    ).toBe("https://gavelhouse.app/compare/versus/foo/");
  });
});
