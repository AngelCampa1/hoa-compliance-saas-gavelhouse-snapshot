import { describe, it, expect } from "vitest";
import { resolveRelatedPageLinks } from "./related-page-resolver";
import type { ContentMap } from "./related-page-resolver";

describe("resolveRelatedPageLinks", () => {
  const contentMap: ContentMap = new Map([
    ["/compare/alternatives/fieldedge-alternative",
      {
        title: "FieldEdge Alternative: Why CrewRoute Wins",
        description:
          "Compare FieldEdge vs CrewRoute for field service dispatch.",
      },
    ],
    ["/guides/how-to-dispatch-field-crews",
      {
        title: "How to Dispatch Field Crews Efficiently",
        description: "A step-by-step guide to field crew dispatching.",
      },
    ],
    ["/compare/pricing/servicetitan-pricing",
      {
        title: "ServiceTitan Pricing Breakdown",
        description: "Full breakdown of ServiceTitan's pricing tiers.",
      },
    ],
  ]);

  it("returns real title and description when href is found in contentMap", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/fieldedge-alternative"],
      contentMap,
    );
    expect(result).toEqual([
      {
        href:"/compare/alternatives/fieldedge-alternative/",
        title: "FieldEdge Alternative: Why CrewRoute Wins",
        description:
          "Compare FieldEdge vs CrewRoute for field service dispatch.",
      },
    ]);
  });

  it("falls back to slug-derived title and empty description when href not in map", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/some-unknown-tool-alternative"],
      contentMap,
    );
    expect(result).toEqual([
      {
        href:"/compare/alternatives/some-unknown-tool-alternative/",
        title: "some unknown tool alternative",
        description: "",
      },
    ]);
  });

  it("appends trailing slash to fallback href when not in contentMap (path-style)", () => {
    const href ="/guides/field-service-scheduling-tips";
    const result = resolveRelatedPageLinks([href], contentMap);
    expect(result[0].href).toBe("/guides/field-service-scheduling-tips/");
    expect(result[0].title).toBe("field service scheduling tips");
    expect(result[0].description).toBe("");
  });

  it("returns empty array for empty hrefs input", () => {
    const result = resolveRelatedPageLinks([], contentMap);
    expect(result).toEqual([]);
  });

  it("handles root href'/' by using the full href as title", () => {
    const result = resolveRelatedPageLinks(["/"], contentMap);
    expect(result).toEqual([
      {
        href:"/",
        title:"/",
        description: "",
      },
    ]);
  });

  it("handles multiple hrefs with a mix of found and not-found entries", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/fieldedge-alternative","/guides/non-existent-guide","/guides/how-to-dispatch-field-crews",
      ],
      contentMap,
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      href:"/compare/alternatives/fieldedge-alternative/",
      title: "FieldEdge Alternative: Why CrewRoute Wins",
      description: "Compare FieldEdge vs CrewRoute for field service dispatch.",
    });
    expect(result[1]).toEqual({
      href:"/guides/non-existent-guide/",
      title: "non existent guide",
      description: "",
    });
    expect(result[2]).toEqual({
      href:"/guides/how-to-dispatch-field-crews/",
      title: "How to Dispatch Field Crews Efficiently",
      description: "A step-by-step guide to field crew dispatching.",
    });
  });

  it("uses empty contentMap and derives all titles from slugs", () => {
    const empty: ContentMap = new Map();
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/jobber-alternative"],
      empty,
    );
    expect(result).toEqual([
      {
        href:"/compare/alternatives/jobber-alternative/",
        title: "jobber alternative",
        description: "",
      },
    ]);
  });

  it("uses single-segment href directly as title when no hyphens present", () => {
    const result = resolveRelatedPageLinks(["noslash"], contentMap);
    expect(result).toEqual([
      {
        href: "noslash/",
        title: "noslash",
        description: "",
      },
    ]);
  });

  it("preserves input order in the output array regardless of contentMap insertion order", () => {
    const hrefs = ["/compare/pricing/servicetitan-pricing","/compare/alternatives/fieldedge-alternative","/guides/how-to-dispatch-field-crews",
    ];
    const result = resolveRelatedPageLinks(hrefs, contentMap);
    expect(result).toHaveLength(3);
    expect(result[0].href).toBe("/compare/pricing/servicetitan-pricing/");
    expect(result[1].href).toBe("/compare/alternatives/fieldedge-alternative/");
    expect(result[2].href).toBe("/guides/how-to-dispatch-field-crews/");
  });

  it("handles empty-string href without crashing", () => {
    const result = resolveRelatedPageLinks([""], contentMap);
    expect(result).toEqual([{ href:"/", title: "", description: "" }]);
  });

  it("returns canonicalHref with trailing slash when entry has canonicalHref set", () => {
    const mapWithCanonical: ContentMap = new Map([
      ["/compare/alternatives/finch-alternative-adhd",
        {
          title: "Finch Alternative for ADHD",
          description: "Why Mutra beats Finch.",
          canonicalHref:"/compare/alternatives/finch",
        },
      ],
    ]);
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/finch-alternative-adhd"],
      mapWithCanonical,
    );
    expect(result).toEqual([
      {
        href:"/compare/alternatives/finch/",
        title: "Finch Alternative for ADHD",
        description: "Why Mutra beats Finch.",
      },
    ]);
  });

  it("returns the passed-in href with trailing slash when entry has no canonicalHref", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/fieldedge-alternative"],
      contentMap,
    );
    expect(result[0].href).toBe("/compare/alternatives/fieldedge-alternative/");
  });

  it("resolves entry when href has trailing slash but map key does not", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/fieldedge-alternative/"],
      contentMap,
    );
    expect(result).toEqual([
      {
        href:"/compare/alternatives/fieldedge-alternative/",
        title: "FieldEdge Alternative: Why CrewRoute Wins",
        description:
          "Compare FieldEdge vs CrewRoute for field service dispatch.",
      },
    ]);
  });

  it("appends trailing slash to href when found in contentMap (no canonicalHref)", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/fieldedge-alternative"],
      contentMap,
    );
    expect(result[0].href).toBe("/compare/alternatives/fieldedge-alternative/");
  });

  it("appends trailing slash to fallback href when not in contentMap", () => {
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/unknown-tool"],
      contentMap,
    );
    expect(result[0].href).toBe("/compare/alternatives/unknown-tool/");
  });

  it("appends trailing slash to canonicalHref when entry has one", () => {
    const mapWithCanonical: ContentMap = new Map([
      ["/compare/alternatives/finch-alternative-adhd",
        {
          title: "Finch Alternative for ADHD",
          description: "Why Mutra beats Finch.",
          canonicalHref:"/compare/alternatives/finch",
        },
      ],
    ]);
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/finch-alternative-adhd"],
      mapWithCanonical,
    );
    expect(result[0].href).toBe("/compare/alternatives/finch/");
  });

  it("does not double trailing slash when canonicalHref already has one", () => {
    const mapWithCanonical: ContentMap = new Map([
      ["/compare/alternatives/finch-alternative-adhd",
        {
          title: "Finch Alternative for ADHD",
          description: "Why Mutra beats Finch.",
          canonicalHref:"/compare/alternatives/finch/",
        },
      ],
    ]);
    const result = resolveRelatedPageLinks(
      ["/compare/alternatives/finch-alternative-adhd"],
      mapWithCanonical,
    );
    expect(result[0].href).toBe("/compare/alternatives/finch/");
  });

  it("preserves root slash'/' without doubling", () => {
    const result = resolveRelatedPageLinks(["/"], contentMap);
    expect(result[0].href).toBe("/");
  });
});
