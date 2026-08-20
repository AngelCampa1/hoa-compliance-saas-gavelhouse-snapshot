import { describe, expect, it } from "vitest";
import { resolveLeadMagnetOffer, toLeadMagnet } from "./lead-magnet-offer";

describe("resolveLeadMagnetOffer", () => {
  const leadMagnets = [
    {
      slug: "reserve-fund-calculator",
      data: {
        title: "Reserve Fund Calculator",
        description: "Calculate percent funded fast.",
      },
    },
    {
      slug: "50-state-reserve-fund-requirements",
      data: {
        title: "50-State Reserve Fund Requirements",
        description: "State-by-state rules in one reference.",
      },
    },
  ] as const;

  it("prefers the first related /free page as the contextual offer", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: ["/resources/guides/example","/free/reserve-fund-calculator","/free/50-state-reserve-fund-requirements",
      ],
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback",
        description: "Fallback desc",
        ctaText: "Get the guide",
      },
    });

    expect(offer.slug).toBe("reserve-fund-calculator");
    expect(offer.destination).toBe("/free/reserve-fund-calculator/");
    expect(offer.title).toBe("Reserve Fund Calculator");
  });

  it("falls back to the site-wide lead magnet when no contextual /free page exists", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: ["/resources/guides/example"],
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback",
        description: "Fallback desc",
        ctaText: "Get the guide",
      },
    });

    expect(offer.slug).toBe("50-state-reserve-fund-requirements");
    expect(offer.destination).toBe("/free/50-state-reserve-fund-requirements/");
    expect(offer.ctaText).toBe("Get the guide");
  });

  it("defaults relatedPages to an empty array when it is omitted", () => {
    const offer = resolveLeadMagnetOffer({
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback",
        description: "Fallback desc",
      },
    });

    expect(offer.slug).toBe("50-state-reserve-fund-requirements");
  });

  it("uses the matching collection entry when the fallback slug exists in the collection", () => {
    const offer = resolveLeadMagnetOffer({
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback title",
        description: "Fallback desc",
        ctaText: "Get the state guide",
        teaser: "Updated for the latest reserve rules.",
      },
    });

    expect(offer).toEqual({
      slug: "50-state-reserve-fund-requirements",
      title: "50-State Reserve Fund Requirements",
      description: "State-by-state rules in one reference.",
      ctaText: "Get the state guide",
      destination:"/free/50-state-reserve-fund-requirements/",
      teaser: "Updated for the latest reserve rules.",
    });
  });

  it("skips unknown /free paths and still falls back cleanly", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: ["/free/unknown-guide","/resources/guides/example"],
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback",
        description: "Fallback desc",
      },
    });

    expect(offer.slug).toBe("50-state-reserve-fund-requirements");
  });

  it("normalizes trailing slashes in related pages", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: ["/free/reserve-fund-calculator/"],
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "50-state-reserve-fund-requirements",
        title: "Fallback",
        description: "Fallback desc",
      },
    });

    expect(offer.slug).toBe("reserve-fund-calculator");
  });

  it("returns collection defaults when resolving a contextual offer without fallback config", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: ["/free/reserve-fund-calculator"],
      leadMagnets: leadMagnets as never,
    });

    expect(offer).toEqual({
      slug: "reserve-fund-calculator",
      title: "Reserve Fund Calculator",
      description: "Calculate percent funded fast.",
      ctaText: "Get the Free Guide",
      destination:"/free/reserve-fund-calculator/",
      teaser: undefined,
    });
  });

  it("throws when neither a related lead magnet nor a fallback is available", () => {
    expect(() =>
      resolveLeadMagnetOffer({
        relatedPages: ["/resources/guides/example"],
        leadMagnets: leadMagnets as never,
      }),
    ).toThrow(
      "Unable to resolve a lead magnet offer without related /free pages or a fallback site lead magnet.",
    );
  });

  it("creates a fallback offer when the slug is not in the collection", () => {
    const offer = resolveLeadMagnetOffer({
      relatedPages: [],
      leadMagnets: leadMagnets as never,
      fallbackLeadMagnet: {
        slug: "hoa-budget-template",
        title: "HOA Budget Template",
        description: "Build a board-ready budget faster.",
      },
    });

    expect(offer).toEqual({
      slug: "hoa-budget-template",
      title: "HOA Budget Template",
      description: "Build a board-ready budget faster.",
      ctaText: "Get the Free Guide",
      destination:"/free/hoa-budget-template/",
      teaser: undefined,
    });
  });

  it("throws when the fallback lead magnet is missing a slug", () => {
    expect(() =>
      resolveLeadMagnetOffer({
        relatedPages: [],
        leadMagnets: leadMagnets as never,
        fallbackLeadMagnet: {
          title: "Fallback",
          description: "Fallback desc",
        } as never,
      }),
    ).toThrow(
      "Site leadMagnet config must include a slug to resolve the canonical destination.",
    );
  });
});

describe("toLeadMagnet", () => {
  it("converts an offer back to the site lead magnet shape", () => {
    expect(
      toLeadMagnet({
        slug: "reserve-fund-calculator",
        title: "Reserve Fund Calculator",
        description: "Calculate funding gaps fast.",
        ctaText: "Get the guide",
        destination:"/free/reserve-fund-calculator/",
        teaser: "Funding ratio worksheet included.",
      }),
    ).toEqual({
      slug: "reserve-fund-calculator",
      title: "Reserve Fund Calculator",
      description: "Calculate funding gaps fast.",
      ctaText: "Get the guide",
      teaser: "Funding ratio worksheet included.",
    });
  });
});
