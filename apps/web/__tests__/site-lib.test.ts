import { describe, it, expect } from "vitest";
import {
  buildAlternativeBreadcrumbs,
  buildVersusBreadcrumbs,
  buildPricingBreadcrumbs,
  buildGuideBreadcrumbs,
  buildListicleBreadcrumbs,
  buildStateBreadcrumbs,
} from "../src/lib/site-breadcrumbs.js";
import {
  buildAlternativeComparisonRows,
  buildVersusComparisonRows,
  buildPricingComparisonRows,
} from "../src/lib/comparison-rows.js";
import {
  buildContentMap,
  padToolIndex,
  buildOptionalHowToSchema,
} from "../src/lib/page-helpers.js";

// ---------------------------------------------------------------------------
// site-breadcrumbs
// ---------------------------------------------------------------------------

describe("buildAlternativeBreadcrumbs", () => {
  it("returns 4 breadcrumb items", () => {
    const crumbs = buildAlternativeBreadcrumbs("PayHOA", "payhoa");
    expect(crumbs).toHaveLength(4);
  });

  it("starts with Home and ends with competitor alternative label", () => {
    const crumbs = buildAlternativeBreadcrumbs("PayHOA", "payhoa");
    expect(crumbs[0]).toEqual({ label: "Home", href:"/" });
    expect(crumbs[3]).toEqual({
      label: "PayHOA Alternative",
      href:"/compare/alternatives/payhoa/",
    });
  });
});

describe("buildVersusBreadcrumbs", () => {
  it("returns 4 breadcrumb items", () => {
    const crumbs = buildVersusBreadcrumbs(
      "PayHOA",
      "HOALife","/compare/versus/payhoa-vs-hoalife",
    );
    expect(crumbs).toHaveLength(4);
  });

  it("combines both names in the last item label", () => {
    const crumbs = buildVersusBreadcrumbs(
      "PayHOA",
      "HOALife","/compare/versus/payhoa-vs-hoalife",
    );
    expect(crumbs[3].label).toBe("PayHOA vs HOALife");
  });
});

describe("buildPricingBreadcrumbs", () => {
  it("returns 4 breadcrumb items", () => {
    const crumbs = buildPricingBreadcrumbs("PayHOA","/compare/pricing/payhoa");
    expect(crumbs).toHaveLength(4);
  });

  it("last item uses competitor name + Pricing", () => {
    const crumbs = buildPricingBreadcrumbs(
      "AppFolio","/compare/pricing/appfolio",
    );
    expect(crumbs[3].label).toBe("AppFolio Pricing");
  });
});

describe("buildGuideBreadcrumbs", () => {
  it("returns 4 breadcrumb items", () => {
    const crumbs = buildGuideBreadcrumbs(
      "How to Choose HOA Software","/resources/guides/how-to-choose-hoa-software",
    );
    expect(crumbs).toHaveLength(4);
  });

  it("last item has the guide title", () => {
    const title = "How to Choose HOA Software";
    const crumbs = buildGuideBreadcrumbs(
      title,"/resources/guides/how-to-choose-hoa-software",
    );
    expect(crumbs[3].label).toBe(title);
  });
});

describe("buildListicleBreadcrumbs", () => {
  it("returns 4 breadcrumb items", () => {
    const crumbs = buildListicleBreadcrumbs(
      "Best HOA Software 2026","/resources/best/best-hoa-software-2026",
    );
    expect(crumbs).toHaveLength(4);
  });

  it("second item links to Resources", () => {
    const crumbs = buildListicleBreadcrumbs(
      "Best HOA Software 2026","/resources/best/best-hoa-software-2026",
    );
    expect(crumbs[1]).toEqual({ label: "Resources", href:"/resources/" });
  });
});

describe("buildStateBreadcrumbs", () => {
  it("returns 3 breadcrumb items", () => {
    const crumbs = buildStateBreadcrumbs("Florida","/hoa-compliance/florida");
    expect(crumbs).toHaveLength(3);
  });

  it("last item is the state name", () => {
    const crumbs = buildStateBreadcrumbs(
      "California","/hoa-compliance/california",
    );
    expect(crumbs[2].label).toBe("California");
  });
});

// ---------------------------------------------------------------------------
// comparison-rows
// ---------------------------------------------------------------------------

describe("buildAlternativeComparisonRows", () => {
  it("returns an array of comparison rows", () => {
    const rows = buildAlternativeComparisonRows("$49/mo", "$400", "$20–$99/mo");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("each row has feature and values array", () => {
    const rows = buildAlternativeComparisonRows(
      "$49/mo",
      undefined,
      "$20–$99/mo",
    );
    for (const row of rows) {
      expect(typeof row.feature).toBe("string");
      expect(Array.isArray(row.values)).toBe(true);
      expect(row.values).toHaveLength(2);
    }
  });

  it("uses 'Varies' when setupFee is undefined", () => {
    const rows = buildAlternativeComparisonRows("$49/mo", undefined, "$20/mo");
    const setupRow = rows.find((r) => r.feature === "Setup fee");
    expect(setupRow?.values[0]).toBe("Varies");
  });

  it("uses provided setupFee when defined", () => {
    const rows = buildAlternativeComparisonRows("$49/mo", "$400", "$20/mo");
    const setupRow = rows.find((r) => r.feature === "Setup fee");
    expect(setupRow?.values[0]).toBe("$400");
  });
});

describe("buildVersusComparisonRows", () => {
  it("returns an array with 3-value rows", () => {
    const rows = buildVersusComparisonRows("$49/mo", "$90/mo", "$20–$99/mo");
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.values).toHaveLength(3);
    }
  });
});

describe("buildPricingComparisonRows", () => {
  it("returns rows with 2-value arrays", () => {
    const rows = buildPricingComparisonRows("$49/mo", "$20–$99/mo");
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.values).toHaveLength(2);
    }
  });

  it("first row is Monthly cost", () => {
    const rows = buildPricingComparisonRows("$49/mo", "$20–$99/mo");
    expect(rows[0].feature).toBe("Monthly cost");
    expect(rows[0].values[0]).toBe("$49/mo");
    expect(rows[0].values[1]).toBe("$20–$99/mo");
  });
});

// ---------------------------------------------------------------------------
// page-helpers
// ---------------------------------------------------------------------------

describe("buildContentMap", () => {
  it("returns an empty map when all collections are empty", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.size).toBe(0);
  });

  it("maps alternatives by competitor slug", () => {
    const fakeEntry = {
      slug: "payhoa",
      data: {
        title: "PayHOA Alternative",
        description: "desc",
        competitor: {
          slug: "payhoa",
          name: "PayHOA",
          pricing: "$49/mo",
          weakness: "weak",
        },
      },
    };
    const map = buildContentMap({
      alternatives: [fakeEntry as any],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/compare/alternatives/payhoa")).toBe(true);
    expect(map.get("/compare/alternatives/payhoa")?.title).toBe(
      "PayHOA Alternative",
    );
  });

  it("maps comparisons by both competitor slugs", () => {
    const fakeComparison = {
      slug: "payhoa-vs-hoalife",
      data: {
        title: "PayHOA vs HOALife",
        description: "desc",
        competitorA: { slug: "payhoa", name: "PayHOA", pricing: "$49/mo" },
        competitorB: { slug: "hoalife", name: "HOALife", pricing: "$50/mo" },
        verdict: "Neither",
      },
    };
    const map = buildContentMap({
      alternatives: [],

      comparisons: [fakeComparison as any],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/compare/versus/payhoa-vs-hoalife")).toBe(true);
  });

  it("maps pricing breakdowns by competitor slug", () => {
    const fakePricing = {
      slug: "appfolio",
      data: {
        title: "AppFolio Pricing",
        description: "desc",
        competitor: { slug: "appfolio", name: "AppFolio", pricing: "$280/mo" },
        tiers: [],
        hiddenCosts: [],
      },
    };
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],

      pricingBreakdowns: [fakePricing as any],
      listicles: [],
      guides: [],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/compare/pricing/appfolio")).toBe(true);
  });

  it("maps listicles by slug", () => {
    const fakeListicle = {
      slug: "best-hoa-software-2026",
      data: {
        title: "Best HOA Software 2026",
        description: "desc",
        category: "HOA",
        qualifier: "best",
        tools: [],
      },
    };
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],

      listicles: [fakeListicle as any],
      guides: [],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/resources/best/best-hoa-software-2026")).toBe(true);
  });

  it("maps guides by slug", () => {
    const fakeGuide = {
      slug: "how-to-choose-hoa-software",
      data: {
        title: "How to Choose HOA Software",
        description: "desc",
      },
    };
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],

      guides: [fakeGuide as any],
      statePages: [],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/resources/guides/how-to-choose-hoa-software")).toBe(true);
  });

  it("maps state pages by slug", () => {
    const fakeStatePage = {
      slug: "florida",
      data: {
        title: "Florida HOA Compliance",
        description: "desc",
        state: "Florida",
        stateCode: "FL",
      },
    };
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],

      statePages: [fakeStatePage as any],
      leadMagnets: [],
      productPages: [],
      solutions: [],
    });
    expect(map.has("/hoa-compliance/florida")).toBe(true);
  });
});

describe("buildOptionalHowToSchema", () => {
  it("returns null when steps is undefined", () => {
    const result = buildOptionalHowToSchema(
      undefined,
      "How to manage HOA",
      "A guide",
    );
    expect(result).toBeNull();
  });

  it("returns null when steps is an empty array", () => {
    const result = buildOptionalHowToSchema([], "How to manage HOA", "A guide");
    expect(result).toBeNull();
  });

  it("returns a schema object when steps are provided", () => {
    const result = buildOptionalHowToSchema(
      [{ title: "Step 1", content: "Do this" }],
      "How to manage HOA",
      "A guide",
    );
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });
});

describe("padToolIndex", () => {
  it("pads single-digit index with leading zero", () => {
    expect(padToolIndex(0)).toBe("01");
    expect(padToolIndex(8)).toBe("09");
  });

  it("does not pad double-digit index", () => {
    expect(padToolIndex(9)).toBe("10");
    expect(padToolIndex(99)).toBe("100");
  });
});
