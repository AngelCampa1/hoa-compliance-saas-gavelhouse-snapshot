import { describe, expect, it } from "vitest";
import {
  RESOURCE_HUBS,
  findResourceHub,
  getPrimaryResourceHubForPath,
  getResourceHubHref,
  getResourceHubsForPath,
  normalizeHubPath,
} from "../src/lib/resource-hub-data";
import {
  buildAllHubResources,
  buildResourceHub,
  getResourceHubStaticPaths,
  type ResourceHubCollections,
} from "../src/lib/resource-hub-builder";

function entry(slug: string, data: Record<string, unknown>) {
  return {
    slug,
    data: {
      title: `${slug} title`,
      description: `${slug} description`,
      buyerStage: "tofu",
      publishedAt: "2026-01-01",
      updatedAt: "2026-01-02",
      ...data,
    },
  };
}

function collections(): ResourceHubCollections {
  return {
    alternatives: [
      entry("payhoa", {
        competitor: { slug: "payhoa", name: "PayHOA" },
      }),
    ],
    comparisons: [
      entry("payhoa-vs-gavelhouse", {
        competitorA: { slug: "payhoa", name: "PayHOA" },
        competitorB: { slug: "gavelhouse", name: "Gavelhouse" },
      }),
      entry("payhoa-vs-gavelhouse-duplicate", {
        competitorA: { slug: "payhoa", name: "PayHOA" },
        competitorB: { slug: "gavelhouse", name: "Gavelhouse" },
      }),
    ],
    pricingBreakdowns: [
      entry("payhoa", {
        competitor: { slug: "payhoa", name: "PayHOA" },
      }),
    ],
    listicles: [entry("best-hoa-accounting-software", {})],
    guides: [entry("hoa-reserve-study-guide", {})],
    statePages: [entry("california", { state: "California" })],
    leadMagnets: [entry("reserve-fund-calculator", {})],
    productPages: [
      entry("hoa-reserve-fund-compliance-software", {
        productCategory: "Reserve compliance",
      }),
    ],
    solutions: [
      entry("small-self-managed-hoa-software", {
        audienceLabel: "Small self-managed HOAs",
      }),
    ],
  } as ResourceHubCollections;
}

describe("resource hub data", () => {
  it("normalizes hub paths while preserving root and txt files", () => {
    expect(normalizeHubPath("/")).toBe("/");
    expect(normalizeHubPath("/pricing.txt")).toBe("/pricing.txt");
    expect(normalizeHubPath("/resources")).toBe("/resources/");
  });

  it("finds hubs by slug and builds hub hrefs", () => {
    expect(findResourceHub("software-buying")?.title).toContain("Buying");
    expect(findResourceHub("missing")).toBeNull();
    expect(getResourceHubHref("software-buying")).toBe(
      "/resources/hubs/software-buying/",
    );
  });

  it("matches paths to topical hubs and returns a primary hub", () => {
    const hubs = getResourceHubsForPath(
      "/resources/guides/hoa-reserve-study-guide",
    ).map((hub) => hub.slug);

    expect(hubs).toContain("all-board-resources");
    expect(hubs).toContain("reserve-studies");
    expect(getPrimaryResourceHubForPath("/pricing/")?.slug).toBe(
      "all-board-resources",
    );
    expect(getResourceHubsForPath("/features/").map((hub) => hub.slug)).toEqual(
      expect.arrayContaining([
        "all-board-resources",
        "gavelhouse-product-help",
      ]),
    );
    expect(getPrimaryResourceHubForPath("/unmatched/")).toBeNull();
  });

  it("does not treat generated hub pages as resources inside another hub", () => {
    expect(getResourceHubsForPath("/resources/hubs/software-buying/")).toEqual(
      [],
    );
  });

  it("keeps every hub menu label unique enough for navigation", () => {
    const hrefs = RESOURCE_HUBS.map((hub) => getResourceHubHref(hub.slug));

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(RESOURCE_HUBS.every((hub) => hub.menuLabel.length > 0)).toBe(true);
  });
});

describe("resource hub builder", () => {
  it("builds resources from every public collection family and dedupes hrefs", () => {
    const resources = buildAllHubResources(collections());
    const hrefs = resources.map((resource) => resource.href);

    expect(hrefs).toContain("/compare/alternatives/payhoa/");
    expect(hrefs).toContain("/compare/versus/payhoa-vs-gavelhouse/");
    expect(hrefs).toContain("/compare/pricing/payhoa/");
    expect(hrefs).toContain("/resources/best/best-hoa-accounting-software/");
    expect(hrefs).toContain("/resources/guides/hoa-reserve-study-guide/");
    expect(hrefs).toContain("/hoa-compliance/california/");
    expect(hrefs).toContain("/free/reserve-fund-calculator/");
    expect(hrefs).toContain("/features/");
    expect(hrefs).toContain("/product/hoa-reserve-fund-compliance-software/");
    expect(hrefs).toContain("/solutions/small-self-managed-hoa-software/");
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(
      resources.every((resource) => resource.relatedPages.length === 0),
    ).toBe(true);
  });

  it("builds a grouped hub for matching resources", () => {
    const hub = buildResourceHub("reserve-studies", collections());

    expect(hub?.hub.slug).toBe("reserve-studies");
    expect(hub?.resources.length).toBeGreaterThan(0);
    expect(hub?.resources.map((resource) => resource.href)).toContain(
      "/resources/guides/hoa-reserve-study-guide/",
    );
    expect(hub?.groupedResources.length).toBeGreaterThan(0);
  });

  it("groups repeated resource families under one section", () => {
    const hub = buildResourceHub("all-board-resources", collections());
    const corePages = hub?.groupedResources.find(
      (group) => group.heading === "Core Pages",
    );

    expect(corePages?.resources.length).toBeGreaterThan(1);
  });

  it("returns null for an unknown hub and exposes static paths", () => {
    expect(buildResourceHub("missing", collections())).toBeNull();
    expect(getResourceHubStaticPaths()).toEqual(
      expect.arrayContaining([
        {
          params: { slug: "software-buying" },
          props: { slug: "software-buying" },
        },
      ]),
    );
  });
});
