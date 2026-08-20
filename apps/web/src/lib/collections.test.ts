import { describe, it, expect } from "vitest";
import {
  sortByUpdatedAtDesc,
  mapToContentItems,
  resolveCanonicalUrl,
  sumCategoryCounts,
  formatNumber,
} from "./collections";
import type { BuyerStage } from "./types";

describe("sortByUpdatedAtDesc", () => {
  it("sorts entries newest first by updatedAt", () => {
    const entries = [
      { data: { updatedAt: "2026-01-01" } },
      { data: { updatedAt: "2026-03-01" } },
      { data: { updatedAt: "2026-02-01" } },
    ];
    const sorted = sortByUpdatedAtDesc(entries);
    expect(sorted[0].data.updatedAt).toBe("2026-03-01");
    expect(sorted[1].data.updatedAt).toBe("2026-02-01");
    expect(sorted[2].data.updatedAt).toBe("2026-01-01");
  });

  it("does not mutate the input array", () => {
    const entries = [
      { data: { updatedAt: "2026-01-01" } },
      { data: { updatedAt: "2026-03-01" } },
    ];
    const original = [...entries];
    sortByUpdatedAtDesc(entries);
    expect(entries[0]).toBe(original[0]);
    expect(entries[1]).toBe(original[1]);
  });

  it("handles ties (same date) without error", () => {
    const entries = [
      { data: { updatedAt: "2026-01-01" } },
      { data: { updatedAt: "2026-01-01" } },
    ];
    const sorted = sortByUpdatedAtDesc(entries);
    expect(sorted).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const sorted = sortByUpdatedAtDesc([]);
    expect(sorted).toEqual([]);
  });
});

describe("mapToContentItems", () => {
  const entries = [
    {
      slug: "test-entry",
      data: {
        title: "Test Entry",
        description: "A test",
        buyerStage: "tofu" as BuyerStage,
        publishedAt: "2026-01-01",
        updatedAt: "2026-02-01",
      },
    },
  ];

  it("builds correct ContentItem shape with hrefBuilder", () => {
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: "Test Entry",
      description: "A test",
      href:"/articles/test-entry",
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-02-01",
      relatedPages: [],
    });
  });

  it("uses hrefBuilder for each entry", () => {
    const multiEntries = [
      {
        slug: "a",
        data: {
          title: "A",
          description: "Desc A",
          buyerStage: "tofu" as BuyerStage,
          publishedAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      },
      {
        slug: "b",
        data: {
          title: "B",
          description: "Desc B",
          buyerStage: "mofu" as BuyerStage,
          publishedAt: "2026-02-01",
          updatedAt: "2026-02-01",
        },
      },
    ];
    const items = mapToContentItems(multiEntries, (e) => `/p/${e.slug}`);
    expect(items[0].href).toBe("/p/a");
    expect(items[1].href).toBe("/p/b");
  });

  it("includes metadata when metadataBuilder returns a value", () => {
    const items = mapToContentItems(
      entries,
      (e) => `/articles/${e.slug}`,
      () => ({ category: "guides" }),
    );
    expect(items[0].metadata).toEqual({ category: "guides" });
  });

  it("omits metadata key when metadataBuilder returns undefined", () => {
    const items = mapToContentItems(
      entries,
      (e) => `/articles/${e.slug}`,
      () => undefined,
    );
    expect(items[0]).not.toHaveProperty("metadata");
  });

  it("omits metadata key when no metadataBuilder provided", () => {
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);
    expect(items[0]).not.toHaveProperty("metadata");
  });

  it("forwards relatedPages from data when present as an array of strings", () => {
    const entriesWithRelated = [
      {
        slug: "test-entry",
        data: {
          title: "Test Entry",
          description: "A test",
          buyerStage: "tofu" as BuyerStage,
          publishedAt: "2026-01-01",
          updatedAt: "2026-02-01",
          relatedPages: ["/foo","/bar"],
        },
      },
    ];
    const items = mapToContentItems(
      entriesWithRelated,
      (e) => `/articles/${e.slug}`,
    );
    expect(items[0].relatedPages).toHaveLength(2);
    expect(items[0].relatedPages[0]).toEqual({ href:"/foo", title: "foo" });
    expect(items[0].relatedPages[1]).toEqual({ href:"/bar", title: "bar" });
  });

  it("derives human-readable titles from path-style relatedPages hrefs", () => {
    const entriesWithRelated = [
      {
        slug: "test-entry",
        data: {
          title: "Test Entry",
          description: "A test",
          buyerStage: "tofu" as BuyerStage,
          publishedAt: "2026-01-01",
          updatedAt: "2026-02-01",
          relatedPages: ["/alternatives/some-tool","/comparisons/foo-bar-vs-baz",
          ],
        },
      },
    ];
    const items = mapToContentItems(
      entriesWithRelated,
      (e) => `/articles/${e.slug}`,
    );
    expect(items[0].relatedPages[0]).toEqual({
      href:"/alternatives/some-tool",
      title: "some tool",
    });
    expect(items[0].relatedPages[1]).toEqual({
      href:"/comparisons/foo-bar-vs-baz",
      title: "foo bar vs baz",
    });
  });

  it("produces empty relatedPages when data.relatedPages is undefined", () => {
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);
    expect(items[0].relatedPages).toEqual([]);
  });

  it("produces empty relatedPages when data.relatedPages is an empty array", () => {
    const entriesWithEmpty = [
      {
        slug: "test-entry",
        data: {
          title: "Test Entry",
          description: "A test",
          buyerStage: "tofu" as BuyerStage,
          publishedAt: "2026-01-01",
          updatedAt: "2026-02-01",
          relatedPages: [] as string[],
        },
      },
    ];
    const items = mapToContentItems(
      entriesWithEmpty,
      (e) => `/articles/${e.slug}`,
    );
    expect(items[0].relatedPages).toEqual([]);
  });

  it("includes targetPersona when entry has it", () => {
    const entriesWithPersona = [
      {
        slug: "test-entry",
        data: {
          title: "Test Entry",
          description: "A test",
          buyerStage: "tofu" as BuyerStage,
          publishedAt: "2026-01-01",
          updatedAt: "2026-02-01",
          targetPersona: ["owner-operator", "fleet-manager"],
        },
      },
    ];
    const items = mapToContentItems(
      entriesWithPersona,
      (e) => `/articles/${e.slug}`,
    );
    expect(items[0].targetPersona).toEqual(["owner-operator", "fleet-manager"]);
  });

  it("omits targetPersona when entry does not have it (backward compat)", () => {
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);
    expect(items[0]).not.toHaveProperty("targetPersona");
  });
});

describe("resolveCanonicalUrl", () => {
  it("page 1 returns base URL with trailing slash", () => {
    const result = resolveCanonicalUrl(
      "crewroute.app","/compare/alternatives",
      1,
    );
    expect(result).toBe("https://crewroute.app/compare/alternatives/");
  });

  it("page > 1 returns URL with /{N}/ suffix and trailing slash", () => {
    const result = resolveCanonicalUrl(
      "crewroute.app","/compare/alternatives",
      3,
    );
    expect(result).toBe("https://crewroute.app/compare/alternatives/3/");
  });

  it("strips trailing slash from basePath to avoid double-slash", () => {
    const result = resolveCanonicalUrl("crewroute.app","/guides/", 2);
    expect(result).toBe("https://crewroute.app/guides/2/");
  });

  it("strips trailing slash for page 1 and re-adds one", () => {
    const result = resolveCanonicalUrl("crewroute.app","/guides/", 1);
    expect(result).toBe("https://crewroute.app/guides/");
  });

  it("handles root basePath'/' for page 1", () => {
    const result = resolveCanonicalUrl("crewroute.app","/", 1);
    expect(result).toBe("https://crewroute.app/");
  });

  it("handles root basePath'/' for page > 1", () => {
    const result = resolveCanonicalUrl("crewroute.app","/", 2);
    expect(result).toBe("https://crewroute.app/2/");
  });
});

describe("sumCategoryCounts", () => {
  it("sums counts from multiple categories", () => {
    expect(sumCategoryCounts([{ count: 5 }, { count: 3 }])).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(sumCategoryCounts([])).toBe(0);
  });
});

describe("formatNumber", () => {
  it("formats a number with locale separators", () => {
    const result = formatNumber(12345);
    expect(result).toContain("12");
    expect(result).toContain("345");
  });

  it("formats 0 as '0'", () => {
    expect(formatNumber(0)).toBe("0");
  });
});
