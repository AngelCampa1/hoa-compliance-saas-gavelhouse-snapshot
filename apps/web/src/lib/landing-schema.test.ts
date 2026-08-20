import { describe, expect, it } from "vitest";
import { buildLandingSoftwareApplicationProps } from "./landing-schema";
import type { SiteConfig } from "./types";

const baseConfig: SiteConfig = {
  name: "Kaiplan",
  domain: "kaiplan.app",
  tagline: "Plan Your Wedding. Actually Plan It.",
  theme: {
    primary: "#7C9A82",
    accent: "#C5A55A",
    fonts: {
      heading: "Fraunces",
      body: "DM Sans",
    },
  },
  product: {
    category: "wedding planning",
    price: "$20/mo",
    targetAudience: "couples planning their wedding",
    trustSignals: [],
  },
  competitors: [],
  funnel: {
    tofu: { ctaMode: "educate", ctaText: "Learn more", ctaTarget: "/learn" },
    mofu: { ctaMode: "evaluate", ctaText: "Compare", ctaTarget: "/compare" },
    bofu: { ctaMode: "convert", ctaText: "Buy", ctaTarget: "/pricing" },
    ctaSubtitle: "From $20/mo",
  },
  survey: {
    questions: [],
  },
  faqs: [],
  discoveryCallUrl: "https://example.com/call",
  discoveryCallIncentive: "Talk to us",
  problemAgitation: {
    heading: "Problem",
    closingLine: "Fix",
    painPoints: [],
  },
  referral: {
    enabled: false,
    rewards: [],
  },
};

describe("buildLandingSoftwareApplicationProps", () => {
  it("uses business software defaults for category and operating system", () => {
    expect(
      buildLandingSoftwareApplicationProps(baseConfig, {
        canonicalUrl: "https://kaiplan.app/",
        imageUrl: "https://kaiplan.app/og-default.png",
      }),
    ).toMatchObject({
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    });
  });

  it("uses the first pricing tier features when available", () => {
    const result = buildLandingSoftwareApplicationProps(
      {
        ...baseConfig,
        pricingTiers: [
          {
            name: "Starter",
            price: "$20/mo",
            features: ["Budget ledger", "Guest list"],
          },
        ],
      },
      {
        canonicalUrl: "https://kaiplan.app/",
        imageUrl: "https://kaiplan.app/og-default.png",
      },
    );

    expect(result.featureList).toEqual(["Budget ledger", "Guest list"]);
  });

  it("falls back to the product price when pricing tiers are absent", () => {
    const result = buildLandingSoftwareApplicationProps(baseConfig, {
      canonicalUrl: "https://kaiplan.app/",
      imageUrl: "https://kaiplan.app/og-default.png",
    });

    expect(result.offers).toEqual({
      price: "$20/mo",
      url: "https://kaiplan.app/#pricing",
    });
  });

  it("uses all pricing tiers when pricing tiers exist", () => {
    const result = buildLandingSoftwareApplicationProps(
      {
        ...baseConfig,
        pricingTiers: [
          {
            name: "Starter",
            price: "$20/mo",
            features: ["Budget ledger"],
          },
          {
            name: "Lifetime",
            price: "$100 one-time",
            features: ["Everything"],
          },
        ],
      },
      {
        canonicalUrl: "https://kaiplan.app/",
        imageUrl: "https://kaiplan.app/og-default.png",
      },
    );

    expect(result.offers).toEqual([
      {
        price: "$20/mo",
        url: "https://kaiplan.app/#pricing",
      },
      {
        price: "$100 one-time",
        url: "https://kaiplan.app/#pricing",
      },
    ]);
  });
});
