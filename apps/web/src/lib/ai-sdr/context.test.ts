import { knowledgeBase } from "@boardstack/shared";
import { describe, expect, it } from "vitest";
import { AI_SDR_PRODUCT_ID, buildAiSdrContext } from "./context";

describe("buildAiSdrContext", () => {
  const context = buildAiSdrContext();
  const marketing = knowledgeBase.marketing;

  it("uses the gavelhouse product id and the shared product name/description", () => {
    expect(AI_SDR_PRODUCT_ID).toBe("gavelhouse");
    expect(context.productId).toBe("gavelhouse");
    expect(context.name).toBe(marketing.product.name);
    expect(context.description).toBe(marketing.product.description);
  });

  it("derives every plan from shared knowledge with no hardcoded prices", () => {
    expect(context.plans).toHaveLength(marketing.pricing.plans.length);
    context.plans.forEach((plan, index) => {
      const source = marketing.pricing.plans[index];
      expect(plan.id).toBe(source.id);
      expect(plan.name).toBe(source.name);
      expect(plan.sizeBand).toBe(source.description);
      expect(plan.price).toContain(source.price);
      expect(plan.price).toContain(marketing.offer.code);
      expect(plan.defaultCadence).toBe("year");
      expect(plan.trialDays).toBe(marketing.offer.guaranteeDays);
      expect(plan.ctaUrl).toBe(marketing.funnel.publicSignupUrl);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.features.length).toBeLessThanOrEqual(4);
      expect(plan.features).toEqual(source.features.slice(0, 4));
    });
  });

  it("includes overview, audience, pricing, every pricing FAQ, and founder contact sources", () => {
    const ids = context.sources.map((source) => source.id);
    expect(ids).toContain("product-overview");
    expect(ids).toContain("who-its-for");
    expect(ids).toContain("pricing-overview");
    expect(ids).toContain("founder-contact");
    marketing.pricing.faqs.forEach((faq) => {
      expect(ids).toContain(faq.id);
    });
  });

  it("grounds the pricing source in the shared offer and display range", () => {
    const pricing = context.sources.find((s) => s.id === "pricing-overview");
    expect(pricing?.excerpt).toContain(marketing.pricing.displayRange);
    expect(pricing?.excerpt).toContain(marketing.offer.code);
    expect(pricing?.excerpt).toContain(marketing.offer.guaranteeLabel);
  });

  it("points the founder contact at the shared contact email and path", () => {
    const contact = context.sources.find((s) => s.id === "founder-contact");
    expect(contact?.excerpt).toContain(marketing.founderContact.email);
    expect(contact?.url).toContain(marketing.founderContact.contactPath);
  });

  it("only references the gavelhouse.app public origin in source URLs", () => {
    context.sources.forEach((source) => {
      expect(source.url.startsWith("https://gavelhouse.app")).toBe(true);
    });
  });
});
