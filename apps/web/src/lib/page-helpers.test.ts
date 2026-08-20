import { describe, it, expect } from "vitest";
import {
  buildContentMap,
  padToolIndex,
  buildOptionalHowToSchema,
} from "./page-helpers.js";

// Minimal mock shape -- we only test the mapping logic, not Astro's collection types
type MockEntry<T> = { slug: string; data: T };

const emptyCollections = {
  alternatives: [],
  comparisons: [],
  pricingBreakdowns: [],
  listicles: [],
  guides: [],
  statePages: [],
  leadMagnets: [],
  productPages: [],
  solutions: [],
};

describe("buildContentMap", () => {
  it("maps alternatives to /compare/alternatives/${competitor.slug}", () => {
    const entry: MockEntry<{
      title: string;
      description: string;
      competitor: { slug: string };
    }> = {
      slug: "payhoa",
      data: {
        title: "PayHOA Alternative",
        description: "desc alt",
        competitor: { slug: "payhoa" },
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      alternatives: [entry as never],
    });
    expect(map.has("/compare/alternatives/payhoa")).toBe(true);
    expect(map.get("/compare/alternatives/payhoa")).toEqual({
      title: "PayHOA Alternative",
      description: "desc alt",
    });
  });

  it("maps comparisons to /compare/versus/${slugA}-vs-${slugB}", () => {
    const entry: MockEntry<{
      title: string;
      description: string;
      competitorA: { slug: string };
      competitorB: { slug: string };
    }> = {
      slug: "payhoa-vs-hoalife",
      data: {
        title: "PayHOA vs HOALife",
        description: "desc comp",
        competitorA: { slug: "payhoa" },
        competitorB: { slug: "hoalife" },
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      comparisons: [entry as never],
    });
    expect(map.has("/compare/versus/payhoa-vs-hoalife")).toBe(true);
    expect(map.get("/compare/versus/payhoa-vs-hoalife")?.title).toBe(
      "PayHOA vs HOALife",
    );
  });

  it("maps pricingBreakdowns to /compare/pricing/${slug}", () => {
    const entry: MockEntry<{
      title: string;
      description: string;
      competitor: { slug: string };
    }> = {
      slug: "appfolio-pricing",
      data: {
        title: "AppFolio Pricing",
        description: "desc pricing",
        competitor: { slug: "appfolio" },
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      pricingBreakdowns: [entry as never],
    });
    expect(map.has("/compare/pricing/appfolio-pricing")).toBe(true);
  });

  it("keeps pricing breakdown entries distinct when multiple pages share a competitor slug", () => {
    const baseEntry: MockEntry<{
      title: string;
      description: string;
      competitor: { slug: string };
    }> = {
      slug: "payhoa",
      data: {
        title: "PayHOA Pricing",
        description: "base pricing",
        competitor: { slug: "payhoa" },
      },
    };
    const variantEntry: MockEntry<{
      title: string;
      description: string;
      competitor: { slug: string };
    }> = {
      slug: "payhoa-pricing-for-small-hoas",
      data: {
        title: "PayHOA Pricing for Small HOAs",
        description: "variant pricing",
        competitor: { slug: "payhoa" },
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      pricingBreakdowns: [baseEntry as never, variantEntry as never],
    });
    expect(map.get("/compare/pricing/payhoa")?.title).toBe("PayHOA Pricing");
    expect(
      map.get("/compare/pricing/payhoa-pricing-for-small-hoas")?.title,
    ).toBe("PayHOA Pricing for Small HOAs");
  });

  it("maps listicles to /resources/best/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "best-hoa-software-2026",
      data: { title: "Best HOA Software 2026", description: "desc list" },
    };
    const map = buildContentMap({
      ...emptyCollections,
      listicles: [entry as never],
    });
    expect(map.has("/resources/best/best-hoa-software-2026")).toBe(true);
  });

  it("maps guides to /resources/guides/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "hoa-reserve-fund-guide",
      data: { title: "HOA Reserve Fund Guide", description: "desc guide" },
    };
    const map = buildContentMap({
      ...emptyCollections,
      guides: [entry as never],
    });
    expect(map.has("/resources/guides/hoa-reserve-fund-guide")).toBe(true);
    expect(map.get("/resources/guides/hoa-reserve-fund-guide")).toEqual({
      title: "HOA Reserve Fund Guide",
      description: "desc guide",
    });
  });

  it("maps statePages to /hoa-compliance/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "florida",
      data: { title: "Florida HOA Compliance", description: "desc state" },
    };
    const map = buildContentMap({
      ...emptyCollections,
      statePages: [entry as never],
    });
    expect(map.has("/hoa-compliance/florida")).toBe(true);
  });

  it("maps lead magnets to /free/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "hoa-reserve-fund-checklist",
      data: {
        title: "HOA Reserve Fund Checklist",
        description: "desc lead magnet",
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      leadMagnets: [entry as never],
    });
    expect(map.has("/free/hoa-reserve-fund-checklist")).toBe(true);
    expect(map.get("/free/hoa-reserve-fund-checklist")).toEqual({
      title: "HOA Reserve Fund Checklist",
      description: "desc lead magnet",
    });
  });

  it("maps product pages to /product/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "hoa-reserve-fund-compliance-software",
      data: {
        title: "HOA Reserve Fund Compliance Software",
        description: "desc product",
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      productPages: [entry as never],
    });
    expect(map.has("/product/hoa-reserve-fund-compliance-software")).toBe(true);
  });

  it("maps solution pages to /solutions/${slug}", () => {
    const entry: MockEntry<{ title: string; description: string }> = {
      slug: "hoa-treasurer-software",
      data: {
        title: "HOA Treasurer Software",
        description: "desc solution",
      },
    };
    const map = buildContentMap({
      ...emptyCollections,
      solutions: [entry as never],
    });
    expect(map.has("/solutions/hoa-treasurer-software")).toBe(true);
  });

  it("returns correct title and description values for mapped entries", () => {
    const guideEntry: MockEntry<{ title: string; description: string }> = {
      slug: "reserve-study-guide",
      data: { title: "Reserve Study Guide", description: "All about studies" },
    };
    const map = buildContentMap({
      ...emptyCollections,
      guides: [guideEntry as never],
    });
    const entry = map.get("/resources/guides/reserve-study-guide");
    expect(entry?.title).toBe("Reserve Study Guide");
    expect(entry?.description).toBe("All about studies");
  });

  it("all collection entries appear in the result map", () => {
    const altEntry: MockEntry<{
      title: string;
      description: string;
      competitor: { slug: string };
    }> = {
      slug: "a",
      data: {
        title: "A Alt",
        description: "d",
        competitor: { slug: "competitor-a" },
      },
    };
    const guideEntry: MockEntry<{ title: string; description: string }> = {
      slug: "g",
      data: { title: "G Guide", description: "d" },
    };
    const leadMagnetEntry: MockEntry<{ title: string; description: string }> = {
      slug: "lm",
      data: { title: "LM Lead", description: "d" },
    };
    const map = buildContentMap({
      ...emptyCollections,
      alternatives: [altEntry as never],
      guides: [guideEntry as never],
      leadMagnets: [leadMagnetEntry as never],
    });
    expect(map.size).toBe(3);
    expect(map.has("/compare/alternatives/competitor-a")).toBe(true);
    expect(map.has("/resources/guides/g")).toBe(true);
    expect(map.has("/free/lm")).toBe(true);
  });

  it("returns an empty map when all collections are empty", () => {
    const map = buildContentMap(emptyCollections);
    expect(map.size).toBe(0);
  });
});

describe("padToolIndex", () => {
  it('returns "01" for index 0', () => {
    expect(padToolIndex(0)).toBe("01");
  });

  it('returns "10" for index 9', () => {
    expect(padToolIndex(9)).toBe("10");
  });

  it("pads single-digit results with a leading zero", () => {
    expect(padToolIndex(4)).toBe("05");
  });

  it("does not pad double-digit results", () => {
    expect(padToolIndex(99)).toBe("100");
  });
});

describe("buildOptionalHowToSchema", () => {
  it("returns null when steps is undefined", () => {
    const result = buildOptionalHowToSchema(undefined, "Name", "Desc");
    expect(result).toBeNull();
  });

  it("returns null when steps is an empty array", () => {
    const result = buildOptionalHowToSchema([], "Name", "Desc");
    expect(result).toBeNull();
  });

  it("returns a schema object when steps are provided", () => {
    const result = buildOptionalHowToSchema(
      [{ title: "Step 1", content: "Do this first" }],
      "How to manage HOA reserves",
      "A guide for boards",
    );
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  it("schema object contains expected HowTo fields", () => {
    const result = buildOptionalHowToSchema(
      [
        { title: "Step 1", content: "Do this" },
        { title: "Step 2", content: "Then this" },
      ],
      "Reserve Study Steps",
      "How to commission a reserve study",
    );
    expect(result).not.toBeNull();
    expect(result?.["@type"]).toBe("HowTo");
    expect(result?.name).toBe("Reserve Study Steps");
  });
});
