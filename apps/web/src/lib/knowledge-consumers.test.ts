import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knowledgeBase } from "@boardstack/shared";
import { siteConfig } from "../config/site";
import {
  buildAlternativeComparisonRows,
  buildPricingComparisonRows,
  buildVersusComparisonRows,
} from "./comparison-rows";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("marketing knowledge consumers", () => {
  it("derives siteConfig canonical marketing facts from the shared KB", () => {
    expect(siteConfig.name).toBe(knowledgeBase.marketing.product.name);
    expect(siteConfig.contactEmail).toBe(
      knowledgeBase.marketing.founderContact.email,
    );
    expect(siteConfig.pricingTiers.map((tier) => tier.slug)).toEqual(
      knowledgeBase.marketing.pricing.plans.map((plan) => plan.id),
    );
    expect(siteConfig.faqs.map((faq) => faq.q)).toEqual(
      knowledgeBase.marketing.faqs.map((faq) => faq.question),
    );
    expect(siteConfig.competitors.map((competitor) => competitor.slug)).toEqual(
      knowledgeBase.marketing.competitors.map((competitor) => competitor.id),
    );
  });

  it("passes whoItsFor, outcome, and notIdealFor through from the KB plans", () => {
    const plans = knowledgeBase.marketing.pricing.plans;
    const tiers = siteConfig.pricingTiers;

    expect(tiers.map((t) => t.whoItsFor)).toEqual(
      plans.map((p) => p.whoItsFor),
    );
    expect(tiers.map((t) => t.outcome)).toEqual(plans.map((p) => p.outcome));
    expect(tiers.map((t) => t.notIdealFor)).toEqual(
      plans.map((p) => p.notIdealFor),
    );

    for (const tier of tiers) {
      expect(typeof tier.whoItsFor).toBe("string");
      expect(tier.whoItsFor.length).toBeGreaterThan(0);
      expect(typeof tier.outcome).toBe("string");
      expect(tier.outcome.length).toBeGreaterThan(0);
      expect(typeof tier.notIdealFor).toBe("string");
      expect(tier.notIdealFor.length).toBeGreaterThan(0);
    }
  });

  it("keeps comparison rows tied to KB offer and capability facts", () => {
    const ownPrice = knowledgeBase.marketing.pricing.displayRange;
    const setupFee = knowledgeBase.marketing.offer.setupFee;
    const reserveCapability =
      knowledgeBase.marketing.capabilitiesById.reserveCompliance.shortAnswer;
    const fundCapability =
      knowledgeBase.marketing.capabilitiesById.fundAccounting.shortAnswer;
    const portalCapability =
      knowledgeBase.marketing.capabilitiesById.ownerPortal.shortAnswer;
    const targetAudience = knowledgeBase.marketing.product.targetAudienceShort;
    const contract = knowledgeBase.marketing.offer.contract;

    expect(
      buildAlternativeComparisonRows("Competitor pricing", undefined, ownPrice),
    ).toEqual([
      { feature: "Monthly cost", values: ["Competitor pricing", ownPrice] },
      { feature: "Setup fee", values: ["Varies", setupFee] },
      {
        feature: "Reserve fund compliance",
        values: ["No", reserveCapability],
      },
      {
        feature: "Fund accounting",
        values: ["No reserve separation", fundCapability],
      },
      { feature: "Owner portal", values: ["Limited", portalCapability] },
      {
        feature: "Built for",
        values: ["Professional management", targetAudience],
      },
    ]);

    expect(buildVersusComparisonRows("A", "B", ownPrice)[1].values[2]).toBe(
      reserveCapability,
    );
    expect(buildVersusComparisonRows("A", "B", ownPrice)[2].values[2]).toBe(
      targetAudience,
    );
    expect(buildPricingComparisonRows("Competitor pricing", ownPrice)).toEqual([
      { feature: "Monthly cost", values: ["Competitor pricing", ownPrice] },
      { feature: "Setup fee", values: ["Varies", setupFee] },
      { feature: "Contract", values: ["Varies", contract] },
    ]);
  });

  it("pricing page imports FAQ and feature rows instead of owning canonical facts locally", () => {
    const source = readSource("../pages/pricing.astro");

    expect(source).toContain("knowledgeBase.marketing");
    expect(source).toContain("marketingKnowledge.pricing.featureRows");
    expect(source).toContain("marketingKnowledge.pricing.faqs");
    expect(source).toContain("marketingKnowledge.funnel.publicSignupUrl");
    expect(source).not.toContain("const rows = [");
    expect(source).not.toContain("const faqs = [");
  });

  it("siteConfig uses the KB as the canonical marketing adapter", () => {
    const source = readSource("../config/site.ts");

    expect(source).toContain("knowledgeBase.marketing");
    expect(source).not.toContain("COMPETITORS");
    expect(source).not.toContain("PRICING_TIERS");
    expect(source).not.toContain("FAQS");
    expect(source).not.toContain("FUNNEL_BOFU");
  });
});
