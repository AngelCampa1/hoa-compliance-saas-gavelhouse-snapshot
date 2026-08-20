import { describe, expect, it } from "vitest";
import {
  GUARANTEE_CONFIG,
  LIMITED_SUBSCRIPTION_PROMO,
  LIMITED_SUBSCRIPTION_OFFERS,
  PRICING_PLANS,
  getAnnualLimitedOfferBillingText,
  getAnnualPricingRangeLabel,
  getApproxAnnualPricingRangeLabel,
  getDiscountedDisplayPrice,
  getDiscountedDisplayPriceRange,
  getLimitedSubscriptionOffer,
  getLimitedOfferAnnualTotalCents,
  getLimitedOfferUsageText,
  getOriginalDisplayPrice,
  getOriginalDisplayPriceRange,
  getPricingPlan,
  isLimitedOfferActive,
  stripMonthlyPriceSuffix,
} from "../src/pricing.js";
import { PRICING_TIERS } from "../src/brand.js";

describe("shared pricing source of truth", () => {
  it("defines the limited offer prices and annual display amounts", () => {
    expect(
      PRICING_PLANS.map((plan) => ({
        slug: plan.slug,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualTotalPriceCents: plan.annualTotalPriceCents,
        annualMonthlyDisplayPriceCents: plan.annualMonthlyDisplayPriceCents,
      })),
    ).toEqual([
      {
        slug: "starter",
        monthlyPriceCents: 5900,
        annualTotalPriceCents: 58800,
        annualMonthlyDisplayPriceCents: 4900,
      },
      {
        slug: "growth",
        monthlyPriceCents: 16500,
        annualTotalPriceCents: 162000,
        annualMonthlyDisplayPriceCents: 13500,
      },
      {
        slug: "scale",
        monthlyPriceCents: 29900,
        annualTotalPriceCents: 298800,
        annualMonthlyDisplayPriceCents: 24900,
      },
    ]);
  });

  it("exposes the single limited subscription offer", () => {
    expect(LIMITED_SUBSCRIPTION_PROMO).toEqual({
      id: "limited-80-off",
      shortLabel: "Limited time offer",
      offerLabel: "80% off the first year",
      badgeLabel: "80% off first year",
      percentOff: 80,
      totalRedemptionLimit: 300,
      monthly: {
        id: "M80OFF",
        name: "80% OFF - Monthly",
        code: "M80OFF",
        terms: "80% off your first year",
        redemptionLimit: 100,
        stripeCouponId: "M80OFF",
      },
      annual: {
        id: "Y80OFF",
        name: "80% OFF - Yearly",
        code: "Y80OFF",
        terms: "80% off your first year",
        redemptionLimit: 200,
        stripeCouponId: "Y80OFF",
      },
    });
    expect(isLimitedOfferActive()).toBe(true);
    expect(GUARANTEE_CONFIG).toEqual({
      days: 30,
      label: "30-day money-back guarantee",
    });
  });

  it("formats original and discounted display prices", () => {
    expect(getOriginalDisplayPrice("starter", "annual")).toBe("$49/mo");
    expect(getDiscountedDisplayPrice("starter", "annual")).toBe("$10/mo");
    expect(getOriginalDisplayPrice("starter", "monthly")).toBe("$59/mo");
    expect(getDiscountedDisplayPrice("starter", "monthly")).toBe("$12/mo");
    expect(getDiscountedDisplayPrice("scale", "monthly")).toBe("$60/mo");
    expect(getDiscountedDisplayPrice("scale", "monthly", 30)).toBe("$210/mo");
    expect(getDiscountedDisplayPrice("scale", "monthly", 15)).toBe("$255/mo");
    expect(getOriginalDisplayPriceRange(["starter", "scale"], "annual")).toBe(
      "$49-$249/mo",
    );
    expect(getOriginalDisplayPriceRange(["starter"], "annual")).toBe("$49/mo");
    expect(() => getOriginalDisplayPriceRange([], "annual")).toThrow(
      "Cannot format an empty pricing range",
    );
  });

  it("formats discounted display price ranges", () => {
    expect(getDiscountedDisplayPriceRange(["starter", "scale"], "annual")).toBe(
      "$10-$50/mo",
    );
    expect(getDiscountedDisplayPriceRange(["starter"], "annual")).toBe(
      "$10/mo",
    );
    expect(
      getDiscountedDisplayPriceRange(["starter", "scale"], "monthly", 30),
    ).toBe("$42-$210/mo");
    expect(() => getDiscountedDisplayPriceRange([], "annual")).toThrow(
      "Cannot format an empty pricing range",
    );
  });

  it("formats canonical limited-offer display copy", () => {
    expect(stripMonthlyPriceSuffix("$10/mo")).toBe("$10");
    expect(getLimitedOfferAnnualTotalCents(58800)).toBe(11800);
    expect(getAnnualLimitedOfferBillingText(58800, "$10/mo")).toBe(
      "$118 per year with Y80OFF; shown as about $10/mo",
    );
    expect(getLimitedOfferUsageText()).toBe(
      "Use Y80OFF yearly or M80OFF monthly for 80% off your first year.",
    );
    expect(getAnnualPricingRangeLabel(["starter", "scale"])).toBe(
      "$10-$50/mo billed annually with Y80OFF",
    );
    expect(getApproxAnnualPricingRangeLabel(["starter", "scale"])).toBe(
      "about $10-$50/mo billed annually with Y80OFF",
    );
  });

  it("keeps annual launch monthly equivalents tied to annual totals", () => {
    for (const plan of PRICING_PLANS) {
      const offerAnnualTotalCents =
        (plan.annualTotalPriceCents *
          (100 - LIMITED_SUBSCRIPTION_PROMO.percentOff)) /
        100;
      const offerMonthlyEquivalentCents = offerAnnualTotalCents / 12;

      expect(getDiscountedDisplayPrice(plan.slug, "annual")).toBe(
        `$${Math.ceil(offerMonthlyEquivalentCents / 100)}/mo`,
      );
    }
  });

  it("feeds brand pricing from the shared plan data", () => {
    expect(
      PRICING_TIERS.map((tier) => ({
        slug: tier.slug,
        price: tier.price,
        monthlyPriceCents: tier.monthlyPriceCents,
        annualPriceCents: tier.annualPriceCents,
        annualTotalPriceCents: tier.annualTotalPriceCents,
        contactSales: tier.contactSales,
        priceLabel: tier.priceLabel,
      })),
    ).toEqual([
      {
        slug: "starter",
        price: "$10/mo",
        monthlyPriceCents: 5900,
        annualPriceCents: 4900,
        annualTotalPriceCents: 58800,
        contactSales: undefined,
        priceLabel: undefined,
      },
      {
        slug: "growth",
        price: "$27/mo",
        monthlyPriceCents: 16500,
        annualPriceCents: 13500,
        annualTotalPriceCents: 162000,
        contactSales: undefined,
        priceLabel: undefined,
      },
      {
        slug: "scale",
        price: "$50/mo",
        monthlyPriceCents: 29900,
        annualPriceCents: 24900,
        annualTotalPriceCents: 298800,
        contactSales: undefined,
        priceLabel: undefined,
      },
    ]);
  });

  it("lists limited-offer discounted prices as the public display range", () => {
    expect(getDiscountedDisplayPrice("starter", "annual")).toBe("$10/mo");
    expect(getDiscountedDisplayPrice("growth", "annual")).toBe("$27/mo");
    expect(getDiscountedDisplayPrice("scale", "annual")).toBe("$50/mo");
  });

  it("throws when a pricing plan is missing", () => {
    expect(() => getPricingPlan("missing" as never)).toThrow(
      "Missing pricing plan: missing",
    );
  });

  it("has monthly and annual limited subscription offers only", () => {
    expect(LIMITED_SUBSCRIPTION_OFFERS.map((offer) => offer.code)).toEqual([
      "M80OFF",
      "Y80OFF",
    ]);
    expect(getLimitedSubscriptionOffer("monthly").terms).toBe(
      "80% off your first year",
    );
    expect(getLimitedSubscriptionOffer("annual").terms).toBe(
      "80% off your first year",
    );
  });

  it("has 300 total code uses across subscription offers", () => {
    expect(
      LIMITED_SUBSCRIPTION_OFFERS.reduce(
        (total, offer) => total + offer.redemptionLimit,
        0,
      ),
    ).toBe(300);
    expect(LIMITED_SUBSCRIPTION_PROMO.totalRedemptionLimit).toBe(300);
  });

  it("getLimitedSubscriptionOffer returns the correct offer by billing cycle", () => {
    expect(getLimitedSubscriptionOffer("monthly").code).toBe("M80OFF");
    expect(getLimitedSubscriptionOffer("annual").code).toBe("Y80OFF");
    expect(() => getLimitedSubscriptionOffer("weekly" as never)).toThrow(
      "Unknown billing cycle for limited subscription offer: weekly",
    );
  });
});
