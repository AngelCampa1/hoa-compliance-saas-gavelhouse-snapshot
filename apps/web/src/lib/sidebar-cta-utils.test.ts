import { describe, it, expect } from "vitest";
import { buildSidebarCtaProps } from "./sidebar-cta-utils";
import type { BuyerStage, FunnelStage, SiteConfig } from "./types";

const funnel: Record<BuyerStage, FunnelStage> & { ctaSubtitle: string } = {
  tofu: { ctaMode: "educate", ctaText: "Learn More", ctaTarget:"/guides" },
  mofu: {
    ctaMode: "evaluate",
    ctaText: "Compare Plans",
    ctaTarget:"/pricing",
  },
  bofu: {
    ctaMode: "convert",
    ctaText: "Start Free Trial",
    ctaTarget:"/signup",
  },
  ctaSubtitle: "30-day trial. No credit billing details required.",
};

function makeConfig(overrides?: Partial<SiteConfig>): SiteConfig {
  return {
    name: "TestSite",
    domain: "testsite.com",
    tagline: "Test tagline",
    theme: {
      primary: "#000",
      accent: "#fff",
      fonts: { heading: "sans-serif", body: "sans-serif" },
    },
    product: {
      category: "SaaS",
      price: "$49/mo",
      targetAudience: "Developers",
      trustSignals: [],
    },
    competitors: [],
    funnel,
    survey: { questions: [] },
    faqs: [],
    discoveryCallUrl:"/call",
    discoveryCallIncentive: "Free 30-min call",
    problemAgitation: {
      heading: "The problem",
      closingLine: "We fix that",
      painPoints: [],
    },
    referral: { enabled: false, rewards: [] },
    ...overrides,
  } satisfies SiteConfig;
}

describe("buildSidebarCtaProps", () => {
  it("returns correct ctaText and ctaTarget for tofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "tofu");
    expect(result.ctaText).toBe("Learn More");
    expect(result.ctaTarget).toBe("/guides");
  });

  it("returns correct ctaText and ctaTarget for mofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.ctaText).toBe("Compare Plans");
    expect(result.ctaTarget).toBe("/pricing");
  });

  it("returns correct ctaText and ctaTarget for bofu stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.ctaText).toBe("Start Free Trial");
    expect(result.ctaTarget).toBe("/signup");
  });

  it("returns subtitle from config.copy.funnelCta.subtitle when present", () => {
    const config = makeConfig({
      copy: {
        funnelCta: {
          subtitle: "30-day trial. No credit billing details required.",
        },
      },
    });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.subtitle).toBe(
      "30-day trial. No credit billing details required.",
    );
  });

  it("returns undefined for subtitle when config.copy is absent", () => {
    const config = makeConfig({ copy: undefined });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.subtitle).toBeUndefined();
  });

  it("returns bullets from config.copy.funnelCta.benefitBullets when present", () => {
    const config = makeConfig({
      copy: { funnelCta: { benefitBullets: ["Fast setup", "No contracts"] } },
    });
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.bullets).toEqual(["Fast setup", "No contracts"]);
  });

  it("returns undefined for bullets when not configured", () => {
    const config = makeConfig({ copy: undefined });
    const result = buildSidebarCtaProps(config, "bofu");
    expect(result.bullets).toBeUndefined();
  });

  it("returns trustNote from config.copy.funnelCta.trustNote when present", () => {
    const config = makeConfig({
      copy: { funnelCta: { trustNote: "SOC 2 compliant" } },
    });
    const result = buildSidebarCtaProps(config, "mofu");
    expect(result.trustNote).toBe("SOC 2 compliant");
  });

  it("builds shared CTA analytics context from the selected funnel stage", () => {
    const config = makeConfig();
    const result = buildSidebarCtaProps(config, "bofu");

    expect(result.analytics).toEqual({
      buyerStage: "bofu",
      intent: "convert",
      placement: "sidebar",
    });
  });
});
