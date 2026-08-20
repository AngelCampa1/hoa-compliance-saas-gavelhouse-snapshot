import { describe, it, expect } from "vitest";
import { createSitemapSerializer } from "./sitemap-utils.js";

describe("createSitemapSerializer", () => {
  it("returns a Date instance for lastmod when called with no dates map", () => {
    const serialize = createSitemapSerializer();
    const result = serialize({ url: "https://crewroute.app/" });
    expect(result.lastmod).toBeInstanceOf(Date);
  });

  it("sets lastmod to the mapped date when the path matches", () => {
    const dates = {"/compare/alternatives/servicetitan": "2026-03-15" };
    const serialize = createSitemapSerializer(dates);
    const result = serialize({
      url: "https://crewroute.app/compare/alternatives/servicetitan",
    });
    expect(result.lastmod).toBeInstanceOf(Date);
    expect(result.lastmod?.toISOString().startsWith("2026-03-15")).toBe(true);
  });

  it("falls back to a stable default date when path is not in the dates map", () => {
    const dates = {"/some/other/path": "2026-01-01" };
    const serialize = createSitemapSerializer(dates);
    const result = serialize({ url: "https://crewroute.app/unlisted-page" });
    expect(result.lastmod).toBeInstanceOf(Date);
    expect(result.lastmod?.toISOString().startsWith("2026-01-01")).toBe(true);
  });

  it("extracts pathname correctly for nested paths", () => {
    const dates = {"/compare/alternatives/servicetitan": "2025-11-20",
    };
    const serialize = createSitemapSerializer(dates);
    const result = serialize({
      url: "https://crewroute.app/compare/alternatives/servicetitan",
    });
    expect(result.lastmod).toBeInstanceOf(Date);
    // Use UTC accessors -- ISO date strings parse as UTC midnight
    expect(result.lastmod?.getUTCFullYear()).toBe(2025);
    expect(result.lastmod?.getUTCMonth()).toBe(10); // November is UTC month index 10
    expect(result.lastmod?.getUTCDate()).toBe(20);
  });

  it("preserves url, changefreq, and priority from the original item", () => {
    const serialize = createSitemapSerializer();
    const input = {
      url: "https://crewroute.app/resources/guides/hvac-dispatch",
      changefreq: "monthly" as const,
      priority: 0.8,
    };
    const result = serialize(input);
    expect(result.url).toBe(input.url);
    expect(result.changefreq).toBe("monthly");
    expect(result.priority).toBe(0.8);
    expect(result.lastmod).toBeInstanceOf(Date);
  });

  it("handles undefined dates param same as empty map with a stable default date", () => {
    const serialize = createSitemapSerializer(undefined);
    const result = serialize({ url: "https://crewroute.app/any-page" });
    expect(result.lastmod).toBeInstanceOf(Date);
    expect(result.lastmod?.toISOString().startsWith("2026-01-01")).toBe(true);
  });

  it("handles root path lookup correctly", () => {
    const dates = {"/": "2026-03-20" };
    const serialize = createSitemapSerializer(dates);
    const result = serialize({ url: "https://crewroute.app/" });
    expect(result.lastmod).toBeInstanceOf(Date);
    expect(result.lastmod?.toISOString().startsWith("2026-03-20")).toBe(true);
  });

  // --- New tests for priority/changefreq injection ---

  describe("default priority/changefreq rules", () => {
    it("assigns priority 1.0 and changefreq weekly to the root path /", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({ url: "https://crewroute.app/" });
      expect(result.priority).toBe(1.0);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.9 and changefreq monthly to paths containing 'alternatives'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/compare/alternatives/servicetitan",
      });
      expect(result.priority).toBe(0.9);
      expect(result.changefreq).toBe("monthly");
    });

    it("assigns priority 0.9 and changefreq monthly to paths containing 'pricing'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/pricing-breakdown/servicetitan",
      });
      expect(result.priority).toBe(0.9);
      expect(result.changefreq).toBe("monthly");
    });

    it("assigns priority 0.7 and changefreq monthly to paths containing 'versus'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/compare/servicetitan-versus-jobber",
      });
      expect(result.priority).toBe(0.7);
      expect(result.changefreq).toBe("monthly");
    });

    it("assigns priority 0.7 and changefreq monthly to paths containing 'best'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/best-hvac-dispatch-software",
      });
      expect(result.priority).toBe(0.7);
      expect(result.changefreq).toBe("monthly");
    });

    it("assigns priority 0.5 and changefreq monthly to paths containing 'guides'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/resources/guides/hvac-scheduling",
      });
      expect(result.priority).toBe(0.5);
      expect(result.changefreq).toBe("monthly");
    });

    it("assigns priority 0.4 and changefreq weekly to shallow paths (depth <= 2)", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/about",
      });
      expect(result.priority).toBe(0.4);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.85 and changefreq weekly to /compare hub", () => {
      const serialize = createSitemapSerializer();
      const withSlash = serialize({ url: "https://crewroute.app/compare/" });
      expect(withSlash.priority).toBe(0.85);
      expect(withSlash.changefreq).toBe("weekly");
      const withoutSlash = serialize({ url: "https://crewroute.app/compare" });
      expect(withoutSlash.priority).toBe(0.85);
      expect(withoutSlash.changefreq).toBe("weekly");
    });

    it("assigns priority 0.85 and changefreq weekly to /resources hub", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({ url: "https://crewroute.app/resources/" });
      expect(result.priority).toBe(0.85);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.85 and changefreq weekly to /hoa-compliance hub", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/hoa-compliance/",
      });
      expect(result.priority).toBe(0.85);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.4 and changefreq weekly to generic shallow paths like /features", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({ url: "https://crewroute.app/features/" });
      expect(result.priority).toBe(0.4);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.4 and changefreq weekly to depth-2 paths", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/resources/overview",
      });
      expect(result.priority).toBe(0.4);
      expect(result.changefreq).toBe("weekly");
    });

    it("assigns priority 0.1 and changefreq yearly to paths containing 'privacy'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/privacy",
      });
      expect(result.priority).toBe(0.1);
      expect(result.changefreq).toBe("yearly");
    });

    it("assigns priority 0.1 and changefreq yearly to paths containing 'terms'", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/terms-of-service",
      });
      expect(result.priority).toBe(0.1);
      expect(result.changefreq).toBe("yearly");
    });

    it("falls back to priority 0.6 and changefreq monthly for unmatched deep paths", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/blog/some-deep/article/page",
      });
      expect(result.priority).toBe(0.6);
      expect(result.changefreq).toBe("monthly");
    });

    it("first match wins: 'alternatives' beats 'versus' in a path containing both", () => {
      const serialize = createSitemapSerializer();
      // "alternatives" rule (0.9) comes before "versus" rule (0.7)
      const result = serialize({
        url: "https://crewroute.app/alternatives/versus-comparison",
      });
      expect(result.priority).toBe(0.9);
    });

    it("root path'/' beats all other rules (depth <= 2 would also match)", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({ url: "https://crewroute.app/" });
      expect(result.priority).toBe(1.0);
    });
  });

  describe("no-override when item already has priority/changefreq", () => {
    it("does not override priority if already set on the input item", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/",
        priority: 0.3,
      });
      expect(result.priority).toBe(0.3);
    });

    it("does not override changefreq if already set on the input item", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/",
        changefreq: "daily",
      });
      expect(result.changefreq).toBe("daily");
    });

    it("does not override either field when both are set on the input item", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/compare/alternatives/servicetitan",
        priority: 0.8,
        changefreq: "monthly",
      });
      expect(result.priority).toBe(0.8);
      expect(result.changefreq).toBe("monthly");
    });

    it("injects only the missing field when only one is pre-set", () => {
      const serialize = createSitemapSerializer();
      // priority is pre-set; changefreq should still be injected
      const result = serialize({
        url: "https://crewroute.app/",
        priority: 0.5,
      });
      expect(result.priority).toBe(0.5); // preserved
      expect(result.changefreq).toBe("weekly"); // injected from root rule
    });

    it("injects only changefreq when only priority is missing", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/",
        changefreq: "daily",
      });
      expect(result.changefreq).toBe("daily"); // preserved
      expect(result.priority).toBe(1.0); // injected from root rule
    });
  });

  describe("custom priorityRules override", () => {
    it("applies a custom rule when the pattern matches", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/blog\//, priority: 0.8, changefreq: "daily" },
        ],
      });
      const result = serialize({
        url: "https://crewroute.app/blog/my-post",
      });
      expect(result.priority).toBe(0.8);
      expect(result.changefreq).toBe("daily");
    });

    it("custom rule takes precedence over built-in defaults", () => {
      // /alternatives/ would normally be 0.9 from defaults
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/alternatives\//, priority: 0.95, changefreq: "weekly" },
        ],
      });
      const result = serialize({
        url: "https://crewroute.app/compare/alternatives/servicetitan",
      });
      expect(result.priority).toBe(0.95);
      expect(result.changefreq).toBe("weekly");
    });

    it("falls through to built-in defaults when no custom rule matches", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/blog\//, priority: 0.8, changefreq: "daily" },
        ],
      });
      // /alternatives/ path -- custom rule doesn't match, default rule applies
      const result = serialize({
        url: "https://crewroute.app/compare/alternatives/servicetitan",
      });
      expect(result.priority).toBe(0.9);
      expect(result.changefreq).toBe("monthly");
    });

    it("custom rule without changefreq only sets priority; changefreq falls through to defaults", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/blog\//, priority: 0.8 }, // no changefreq
        ],
      });
      // Use a depth-3 path so no default keyword or depth<=2 rule matches --
      // changefreq falls all the way to the FALLBACK "monthly"
      const result = serialize({
        url: "https://crewroute.app/blog/2026/my-post",
      });
      expect(result.priority).toBe(0.8);
      // depth = 3, no special keyword → fallback changefreq is "monthly"
      expect(result.changefreq).toBe("monthly");
    });

    it("first matching custom rule wins (multiple custom rules)", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/alternatives\//, priority: 0.95, changefreq: "weekly" },
          { pattern: /servicetitan/, priority: 0.5, changefreq: "yearly" },
        ],
      });
      const result = serialize({
        url: "https://crewroute.app/compare/alternatives/servicetitan",
      });
      // First rule matches (/alternatives/), so second rule is NOT applied
      expect(result.priority).toBe(0.95);
      expect(result.changefreq).toBe("weekly");
    });

    it("does not override pre-set item fields even with a matching custom rule", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/blog\//, priority: 0.8, changefreq: "daily" },
        ],
      });
      const result = serialize({
        url: "https://crewroute.app/blog/my-post",
        priority: 0.3,
        changefreq: "yearly",
      });
      expect(result.priority).toBe(0.3);
      expect(result.changefreq).toBe("yearly");
    });

    it("works with empty priorityRules array (falls through to defaults)", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [],
      });
      const result = serialize({
        url: "https://crewroute.app/",
      });
      expect(result.priority).toBe(1.0);
      expect(result.changefreq).toBe("weekly");
    });

    it("custom rule without changefreq falls to default rule changefreq when default matches", () => {
      const serialize = createSitemapSerializer(undefined, {
        priorityRules: [
          { pattern: /\/custom-section\//, priority: 0.85 }, // no changefreq
        ],
      });
      // /custom-section/alternatives/foo -- custom rule matches (no changefreq),
      // default "alternatives" rule also matches → changefreq "monthly" from defaults
      const result = serialize({
        url: "https://crewroute.app/custom-section/alternatives/foo",
      });
      expect(result.priority).toBe(0.85);
      expect(result.changefreq).toBe("monthly"); // from default alternatives rule
    });

    it("works with no options object (backward-compatible)", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({ url: "https://crewroute.app/" });
      expect(result.priority).toBe(1.0);
      expect(result.changefreq).toBe("weekly");
    });

    it("works with options object but no priorityRules (falls through to defaults)", () => {
      const serialize = createSitemapSerializer(undefined, {});
      const result = serialize({ url: "https://crewroute.app/" });
      expect(result.priority).toBe(1.0);
      expect(result.changefreq).toBe("weekly");
    });
  });

  describe("edge cases", () => {
    it("handles URLs with trailing slashes correctly for path depth", () => {
      const serialize = createSitemapSerializer();
      // /about/ -- trailing slash, depth should be 1, falls to generic depth rule
      const result = serialize({
        url: "https://crewroute.app/about/",
      });
      expect(result.priority).toBe(0.4);
      expect(result.changefreq).toBe("weekly");
    });

    it("handles URLs with query strings (pathname only is used)", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/?ref=test",
      });
      expect(result.priority).toBe(1.0);
      expect(result.changefreq).toBe("weekly");
    });

    it("depth-2 paths get 0.4/weekly from depth rule", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/hvac-dispatch-software/texas",
      });
      // depth = 2 → priority 0.4, changefreq weekly
      expect(result.priority).toBe(0.4);
      expect(result.changefreq).toBe("weekly");
    });

    it("deeply nested state pages get fallback 0.6/monthly", () => {
      const serialize = createSitemapSerializer();
      const result = serialize({
        url: "https://crewroute.app/hvac-dispatch-software/united-states/texas",
      });
      // depth = 3, no keywords → fallback
      expect(result.priority).toBe(0.6);
      expect(result.changefreq).toBe("monthly");
    });
  });
});
