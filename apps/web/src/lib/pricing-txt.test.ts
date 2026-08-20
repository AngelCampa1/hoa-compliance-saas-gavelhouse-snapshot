import { describe, it, expect } from "vitest";
import { buildPricingTxt } from "./pricing-txt";
import type { PriceTierInput } from "./schema-types";

const baseTiers: PriceTierInput[] = [
  {
    name: "Starter",
    price: "$9/mo",
    features: ["Up to 3 users", "Basic reporting", "Email support"],
  },
  {
    name: "Pro",
    price: "$29/mo",
    features: ["Unlimited users", "Advanced analytics", "Priority support"],
  },
];

describe("buildPricingTxt", () => {
  it("produces correct headers for basic 2-tier output", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("# Acme SaaS Pricing");
    expect(result).toContain("Currency: USD");
  });

  it("includes tier names and prices", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("## Starter");
    expect(result).toContain("Displayed offer price: $9/mo");
    expect(result).toContain("## Pro");
    expect(result).toContain("Displayed offer price: $29/mo");
  });

  it("lists features under each tier", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("- Up to 3 users");
    expect(result).toContain("- Basic reporting");
    expect(result).toContain("- Email support");
    expect(result).toContain("- Unlimited users");
    expect(result).toContain("- Priority support");
  });

  it("includes annual override when present", () => {
    const tiers: PriceTierInput[] = [
      {
        name: "Essential",
        price: "$9/mo",
        annualPriceOverride: "$79/yr",
        features: ["Core features"],
      },
    ];

    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("Annual: $79/yr");
  });

  it("includes lifetime override when present", () => {
    const tiers: PriceTierInput[] = [
      {
        name: "Essential",
        price: "$9/mo",
        annualPriceOverride: "$79/yr",
        lifetimePriceOverride: "$149 lifetime",
        features: ["Core features"],
      },
    ];

    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("Lifetime: $149 lifetime");
  });

  it("omits annual line when annualPriceOverride is absent", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).not.toContain("Annual:");
  });

  it("includes trial text when provided", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
      trialText: "14-day free trial",
    });

    expect(result).toContain("Trial: 14-day free trial");
  });

  it("includes Y80OFF first-year promo and guarantee text when provided", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
      promoText: "Use Y80OFF for 80% off your first year.",
      guaranteeText: "30-day money-back guarantee.",
    });

    expect(result).toContain("Promo: Use Y80OFF for 80% off your first year.");
    expect(result).toContain("Guarantee: 30-day money-back guarantee.");
    expect(result).not.toContain("LAUNCH" + "30");
    expect(result).not.toContain("30% off your first" + " year");
  });

  it("omits trial line when trialText is not provided", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).not.toContain("Trial:");
  });

  it("handles empty features array gracefully", () => {
    const tiers: PriceTierInput[] = [
      {
        name: "Free",
        price: "$0/mo",
        features: [],
      },
    ];

    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("## Free");
    expect(result).toContain("Displayed offer price: $0/mo");
    expect(result).toContain("Features:");
  });

  it("includes the updated date in the output", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("Updated: 2026-04-06");
  });

  it("includes description when present on a tier", () => {
    const tiers: PriceTierInput[] = [
      {
        name: "Business",
        price: "$49/mo",
        description: "Best for growing teams",
        features: ["All Pro features", "Dedicated support"],
      },
    ];

    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers,
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("Description: Best for growing teams");
  });

  it("omits description line when not present on a tier", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: baseTiers,
      updatedAt: "2026-04-06",
    });

    expect(result).not.toContain("Description:");
  });

  it("labels list billing amounts separately from displayed offer price", () => {
    const result = buildPricingTxt({
      productName: "Acme SaaS",
      tiers: [
        {
          name: "Growth",
          price: "$27/mo",
          monthlyPriceCents: 5900,
          annualPriceCents: 2700,
          annualTotalPriceCents: 32400,
          features: ["Core features"],
        },
      ],
      updatedAt: "2026-04-06",
    });

    expect(result).toContain("Monthly billing list price: $59/mo");
    expect(result).toContain("Annual billing list monthly equivalent: $27/mo");
    expect(result).toContain("Annual billing list total: $324/yr");
    expect(result).toContain("Displayed offer price: $27/mo");
  });
});
