import { describe, expect, it } from "vitest";
import {
  getComparisonPath,
  isRoutableContentEntry,
  isSearchIndexableContentEntry,
} from "./content-routing";

describe("content-routing", () => {
  it("excludes draft entries from public routes", () => {
    expect(isRoutableContentEntry({ data: { draft: true } })).toBe(false);
    expect(isRoutableContentEntry({ data: { draft: false } })).toBe(true);
    expect(isRoutableContentEntry({ data: {} })).toBe(true);
  });

  it("excludes draft and noindex entries from search indexes", () => {
    expect(isSearchIndexableContentEntry({ data: { draft: true } })).toBe(
      false,
    );
    expect(isSearchIndexableContentEntry({ data: { noindex: true } })).toBe(
      false,
    );
    expect(
      isSearchIndexableContentEntry({
        data: { draft: false, noindex: false },
      }),
    ).toBe(true);
  });

  it("builds comparison paths from competitor slugs", () => {
    expect(
      getComparisonPath({
        data: {
          competitorA: { slug: "gavelhouse" },
          competitorB: { slug: "payhoa" },
        },
      }),
    ).toBe("/compare/versus/gavelhouse-vs-payhoa/");
  });
});
