import { describe, it, expect } from "vitest";
import {
  ensureTrailingSlash,
  truncateMetaTitle,
  truncateMetaDescription,
  resolveSchemaImage,
  buyerStageToSection,
  resolveOgImage,
  resolveLandingTitle,
} from "./meta";

describe("ensureTrailingSlash", () => {
  it("appends slash when URL has no trailing slash", () => {
    expect(ensureTrailingSlash("https://example.com/foo")).toBe(
      "https://example.com/foo/",
    );
  });

  it("does not double-slash when URL already ends with slash", () => {
    expect(ensureTrailingSlash("https://example.com/foo/")).toBe(
      "https://example.com/foo/",
    );
  });

  it("handles root URL without trailing slash", () => {
    expect(ensureTrailingSlash("https://example.com")).toBe(
      "https://example.com/",
    );
  });

  it("handles root URL with trailing slash", () => {
    expect(ensureTrailingSlash("https://example.com/")).toBe(
      "https://example.com/",
    );
  });

  it("handles deeply nested paths", () => {
    expect(ensureTrailingSlash("https://example.com/a/b/c")).toBe(
      "https://example.com/a/b/c/",
    );
  });

  it("preserves query strings and appends slash before them", () => {
    expect(ensureTrailingSlash("https://example.com/foo?bar=1")).toBe(
      "https://example.com/foo/?bar=1",
    );
  });

  it("preserves hash fragments and appends slash before them", () => {
    expect(ensureTrailingSlash("https://example.com/foo#section")).toBe(
      "https://example.com/foo/#section",
    );
  });

  it("preserves query string and hash together", () => {
    expect(ensureTrailingSlash("https://example.com/foo?bar=1#section")).toBe(
      "https://example.com/foo/?bar=1#section",
    );
  });

  it("does not add slash when path already has trailing slash with query", () => {
    expect(ensureTrailingSlash("https://example.com/foo/?bar=1")).toBe(
      "https://example.com/foo/?bar=1",
    );
  });

  it("handles empty string", () => {
    expect(ensureTrailingSlash("")).toBe("/");
  });

  it("handles bare path without protocol", () => {
    expect(ensureTrailingSlash("/foo/bar")).toBe("/foo/bar/");
  });

  it("handles bare path that already ends with slash", () => {
    expect(ensureTrailingSlash("/foo/bar/")).toBe("/foo/bar/");
  });

  it("handles single slash", () => {
    expect(ensureTrailingSlash("/")).toBe("/");
  });
});

describe("truncateMetaTitle", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncateMetaTitle("Short title")).toBe("Short title");
  });

  it("truncates at word boundary when too long", () => {
    const long =
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    const result = truncateMetaTitle(long, 60);

    expect(result).not.toBe(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toBe(
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa…",
    );
  });

  it("uses default maxLen of 60", () => {
    const exactly60 = "A".repeat(60);
    expect(truncateMetaTitle(exactly60)).toBe(exactly60);
  });
});

describe("truncateMetaDescription", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncateMetaDescription("Short desc")).toBe("Short desc");
  });

  it("truncates at word boundary when too long", () => {
    const long =
      "Arizona childcare software guide for licensed centers regulated by ADHS Bureau of Child Care Licensing under Arizona Administrative Code A.A.C. R9-5 with Child Care Assistance billing support.";
    const result = truncateMetaDescription(long, 160);

    expect(result).not.toBe(long);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toBe(
      "Arizona childcare software guide for licensed centers regulated by ADHS Bureau of Child Care Licensing under Arizona Administrative Code A.A.C. R9-5 with Child…",
    );
  });

  it("uses default maxLen of 160", () => {
    const exactly160 = "A".repeat(160);
    expect(truncateMetaDescription(exactly160)).toBe(exactly160);
  });
});

describe("resolveSchemaImage", () => {
  it("returns ogImage if it starts with http", () => {
    expect(resolveSchemaImage("example.com", "https://cdn.com/img.png")).toBe(
      "https://cdn.com/img.png",
    );
  });

  it("prepends https: to protocol-relative ogImage", () => {
    expect(resolveSchemaImage("example.com","//cdn.com/img.png")).toBe(
      "https://cdn.com/img.png",
    );
  });

  it("prepends domain to root-relative ogImage", () => {
    expect(resolveSchemaImage("example.com","/img.png")).toBe(
      "https://example.com/img.png",
    );
  });

  it("returns ogImage as-is for other formats", () => {
    expect(resolveSchemaImage("example.com", "img.png")).toBe("img.png");
  });

  it("uses defaultOgImage when ogImage is undefined", () => {
    expect(resolveSchemaImage("example.com", undefined,"/default.png")).toBe(
      "https://example.com/default.png",
    );
  });

  it("falls back to og-default.png when both are undefined", () => {
    expect(resolveSchemaImage("example.com")).toBe(
      "https://example.com/og-default.png",
    );
  });
});

describe("buyerStageToSection", () => {
  it("maps tofu to Educational", () => {
    expect(buyerStageToSection("tofu")).toBe("Educational");
  });

  it("maps mofu to Comparison", () => {
    expect(buyerStageToSection("mofu")).toBe("Comparison");
  });

  it("maps bofu to Product", () => {
    expect(buyerStageToSection("bofu")).toBe("Product");
  });

  it("maps unknown stage to General", () => {
    expect(buyerStageToSection("unknown" as never)).toBe("General");
  });
});

describe("resolveOgImage", () => {
  it("returns root-relative ogImage with siteUrl prepended", () => {
    expect(
      resolveOgImage(
        "https://example.com/page","/og.png",
        "https://example.com",
      ),
    ).toBe("https://example.com/og.png");
  });

  it("strips trailing slash from siteUrl before prepending", () => {
    expect(
      resolveOgImage(
        "https://example.com/page","/og.png",
        "https://example.com/",
      ),
    ).toBe("https://example.com/og.png");
  });

  it("returns ogImage as-is when it is not root-relative", () => {
    expect(
      resolveOgImage(
        "https://example.com/page",
        "https://cdn.com/og.png",
        "https://example.com",
      ),
    ).toBe("https://cdn.com/og.png");
  });

  it("returns ogImage as-is when root-relative but no siteUrl", () => {
    expect(resolveOgImage("https://example.com/page","/og.png")).toBe("/og.png",
    );
  });

  it("returns protocol-relative ogImage as-is", () => {
    expect(
      resolveOgImage(
        "https://example.com/page","//cdn.com/og.png",
        "https://example.com",
      ),
    ).toBe("//cdn.com/og.png");
  });

  it("falls back to origin + /og-default.png when no ogImage", () => {
    expect(resolveOgImage("https://example.com/page")).toBe(
      "https://example.com/og-default.png",
    );
  });

  it("falls back to siteUrl + /og-default.png when canonicalUrl is invalid", () => {
    expect(resolveOgImage("not-a-url", undefined, "https://example.com/")).toBe(
      "https://example.com/og-default.png",
    );
  });

  it("falls back to /og-default.png when canonicalUrl is invalid and no siteUrl", () => {
    expect(resolveOgImage("not-a-url")).toBe("/og-default.png");
  });
});

describe("resolveLandingTitle", () => {
  it("keeps the existing name-tagline fallback by default", () => {
    expect(
      resolveLandingTitle({
        name: "Ondara",
        tagline: "Dispatch software for growing shops",
        product: {
          category: "HVAC dispatch software",
          price: "$49",
          targetAudience: "Shop owners",
          trustSignals: [],
        },
      } as never),
    ).toBe("Ondara - Dispatch software for growing shops");
  });

  it("supports category-first titles when explicitly enabled", () => {
    expect(
      resolveLandingTitle(
        {
          name: "Ondara",
          tagline: "Dispatch software for growing shops",
          product: {
            category: "HVAC dispatch software",
            price: "$49",
            targetAudience: "Shop owners",
            trustSignals: [],
          },
        } as never,
        undefined,
        true,
      ),
    ).toBe("HVAC dispatch software | Ondara");
  });

  it("preserves an explicit title override", () => {
    expect(
      resolveLandingTitle(
        {
          name: "Ondara",
          tagline: "Dispatch software for growing shops",
          product: {
            category: "HVAC dispatch software",
            price: "$49",
            targetAudience: "Shop owners",
            trustSignals: [],
          },
        } as never,
        "Custom landing title",
      ),
    ).toBe("Custom landing title");
  });

  it("falls back to the existing name-tagline pattern when category is blank", () => {
    expect(
      resolveLandingTitle({
        name: "Ondara",
        tagline: "Dispatch software for growing shops",
        product: {
          category: "",
          price: "$49",
          targetAudience: "Shop owners",
          trustSignals: [],
        },
      } as never),
    ).toBe("Ondara - Dispatch software for growing shops");
  });
});
