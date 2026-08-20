import { describe, it, expect } from "vitest";
import {
  buildAlternativeBreadcrumbs,
  buildVersusBreadcrumbs,
  buildPricingBreadcrumbs,
  buildGuideBreadcrumbs,
  buildListicleBreadcrumbs,
  buildStateBreadcrumbs,
} from "./site-breadcrumbs";

describe("buildAlternativeBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slashes on all static hrefs", () => {
    const crumbs = buildAlternativeBreadcrumbs("Buildium", "buildium");
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "Compare", href:"/compare/" },
      { label: "Alternatives", href:"/compare/alternatives/" },
      {
        label: "Buildium Alternative",
        href:"/compare/alternatives/buildium/",
      },
    ]);
  });

  it("appends trailing slash to the generated competitor slug href", () => {
    const crumbs = buildAlternativeBreadcrumbs("AppFolio", "appfolio");
    expect(crumbs[3].href).toBe("/compare/alternatives/appfolio/");
  });

  it("uses competitor name in the last breadcrumb label", () => {
    const crumbs = buildAlternativeBreadcrumbs("PayHOA", "payhoa");
    expect(crumbs[3].label).toBe("PayHOA Alternative");
  });
});

describe("buildVersusBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slashes on all static hrefs", () => {
    const crumbs = buildVersusBreadcrumbs(
      "Buildium",
      "AppFolio","/compare/versus/buildium-vs-appfolio/",
    );
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "Compare", href:"/compare/" },
      { label: "Head-to-Head", href:"/compare/versus/" },
      {
        label: "Buildium vs AppFolio",
        href:"/compare/versus/buildium-vs-appfolio/",
      },
    ]);
  });

  it("passes canonicalPath through to the last crumb href unchanged", () => {
    const crumbs = buildVersusBreadcrumbs(
      "Condo Control",
      "TownSq","/compare/versus/condo-control-vs-townsq/",
    );
    expect(crumbs[3].href).toBe("/compare/versus/condo-control-vs-townsq/");
  });
});

describe("buildPricingBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slashes on all static hrefs", () => {
    const crumbs = buildPricingBreadcrumbs(
      "Buildium","/compare/pricing/buildium/",
    );
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "Compare", href:"/compare/" },
      { label: "Pricing", href:"/compare/pricing/" },
      { label: "Buildium Pricing", href:"/compare/pricing/buildium/" },
    ]);
  });

  it("uses competitor name in the last breadcrumb label", () => {
    const crumbs = buildPricingBreadcrumbs(
      "PayHOA","/compare/pricing/payhoa/",
    );
    expect(crumbs[3].label).toBe("PayHOA Pricing");
  });
});

describe("buildGuideBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slashes on all static hrefs", () => {
    const crumbs = buildGuideBreadcrumbs(
      "HOA Reserve Study Guide","/resources/guides/hoa-reserve-study-guide/",
    );
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "Resources", href:"/resources/" },
      { label: "Guides", href:"/resources/guides/" },
      {
        label: "HOA Reserve Study Guide",
        href:"/resources/guides/hoa-reserve-study-guide/",
      },
    ]);
  });

  it("passes guide title to the last breadcrumb label", () => {
    const crumbs = buildGuideBreadcrumbs(
      "HOA Fund Accounting Guide","/resources/guides/hoa-fund-accounting-guide/",
    );
    expect(crumbs[3].label).toBe("HOA Fund Accounting Guide");
  });
});

describe("buildListicleBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slashes on all static hrefs", () => {
    const crumbs = buildListicleBreadcrumbs(
      "Best HOA Software 2026","/resources/best/best-hoa-software/",
    );
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "Resources", href:"/resources/" },
      { label: "Software Roundups", href:"/resources/best/" },
      {
        label: "Best HOA Software 2026",
        href:"/resources/best/best-hoa-software/",
      },
    ]);
  });

  it("passes listicle title to the last breadcrumb label", () => {
    const crumbs = buildListicleBreadcrumbs(
      "Best Reserve Fund Software","/resources/best/best-reserve-fund-software/",
    );
    expect(crumbs[3].label).toBe("Best Reserve Fund Software");
  });
});

describe("buildStateBreadcrumbs", () => {
  it("returns breadcrumbs with trailing slash on HOA Compliance href", () => {
    const crumbs = buildStateBreadcrumbs(
      "California","/hoa-compliance/california/",
    );
    expect(crumbs).toEqual([
      { label: "Home", href:"/" },
      { label: "HOA Compliance", href:"/hoa-compliance/" },
      { label: "California", href:"/hoa-compliance/california/" },
    ]);
  });

  it("uses state name in the last breadcrumb label", () => {
    const crumbs = buildStateBreadcrumbs("Texas","/hoa-compliance/texas/");
    expect(crumbs[2].label).toBe("Texas");
  });
});
