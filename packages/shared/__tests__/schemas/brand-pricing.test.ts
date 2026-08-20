import { describe, it, expect } from "vitest";
import {
  BRAND_NOREPLY_EMAIL,
  BRAND_TRANSACTIONAL_SENDER,
  COPY,
  FAQS,
  FUNNEL_BOFU,
  FUNNEL_CTA_SUBTITLE,
  PRODUCT_PRICE,
  PUBLIC_API_URL,
  PUBLIC_APP_URL,
  PUBLIC_WEB_URL,
  PRICING_CONFIG,
  PRICING_TIERS,
} from "../../src/brand.js";

// Helper: look up the statutoryFeature for a given plan feature label
function findFeature(slug: string, labelSubstring: string) {
  const tier = PRICING_TIERS.find((t) => t.slug === slug);
  return tier?.statutoryFeatures?.find((f) => f.label.includes(labelSubstring));
}

describe("PricingTier extended fields", () => {
  it("PRICING_TIERS has exactly 3 priced public tiers", () => {
    expect(PRICING_TIERS).toHaveLength(3);
  });

  it("tier names are Starter, Growth, Scale", () => {
    expect(PRICING_TIERS.map((t) => t.name)).toEqual([
      "Starter",
      "Growth",
      "Scale",
    ]);
  });

  it("all tiers have a slug field", () => {
    for (const tier of PRICING_TIERS) {
      expect(typeof tier.slug).toBe("string");
      expect(tier.slug.length).toBeGreaterThan(0);
    }
  });

  it("slug values are unique across tiers", () => {
    const slugs = PRICING_TIERS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("slug values match expected pattern", () => {
    const expected = ["starter", "growth", "scale"];
    expect(PRICING_TIERS.map((t) => t.slug)).toEqual(expected);
  });

  it("self-serve tiers have stripePriceMonthlyEnv string", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(typeof tier.stripePriceMonthlyEnv).toBe("string");
      expect(tier.stripePriceMonthlyEnv?.length).toBeGreaterThan(0);
    }
  });

  it("self-serve tiers have stripePriceAnnualEnv string", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(typeof tier.stripePriceAnnualEnv).toBe("string");
      expect(tier.stripePriceAnnualEnv?.length).toBeGreaterThan(0);
    }
  });

  it("stripePriceMonthlyEnv follows the naming pattern", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.stripePriceMonthlyEnv).toBe("STRIPE_PRICE_STARTER_MONTHLY");

    const growth = PRICING_TIERS.find((t) => t.slug === "growth");
    expect(growth?.stripePriceMonthlyEnv).toBe("STRIPE_PRICE_GROWTH_MONTHLY");

    const scale = PRICING_TIERS.find((t) => t.slug === "scale");
    expect(scale?.stripePriceMonthlyEnv).toBe("STRIPE_PRICE_SCALE_MONTHLY");

    expect(PRICING_TIERS.some((t) => t.slug === "portfolio")).toBe(false);
  });

  it("stripePriceAnnualEnv follows the naming pattern", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.stripePriceAnnualEnv).toBe("STRIPE_PRICE_STARTER_ANNUAL");

    const growth = PRICING_TIERS.find((t) => t.slug === "growth");
    expect(growth?.stripePriceAnnualEnv).toBe("STRIPE_PRICE_GROWTH_ANNUAL");

    const scale = PRICING_TIERS.find((t) => t.slug === "scale");
    expect(scale?.stripePriceAnnualEnv).toBe("STRIPE_PRICE_SCALE_ANNUAL");

    expect(PRICING_TIERS.some((t) => t.slug === "portfolio")).toBe(false);
  });

  it("self-serve tiers have annualPriceCents as a positive integer", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(typeof tier.annualPriceCents).toBe("number");
      expect(tier.annualPriceCents).toBeGreaterThan(0);
      expect(Number.isInteger(tier.annualPriceCents)).toBe(true);
    }
  });

  it("annualPriceCents are less than monthlyPriceCents (annual is discounted)", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(tier.annualPriceCents ?? 0).toBeLessThan(
        tier.monthlyPriceCents ?? 0,
      );
    }
  });

  it("Starter annualPriceCents is 4900 ($49/mo billed annually)", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.annualPriceCents).toBe(4900);
  });

  it("Growth annualPriceCents is 13500 ($135/mo billed annually)", () => {
    const growth = PRICING_TIERS.find((t) => t.slug === "growth");
    expect(growth?.annualPriceCents).toBe(13500);
  });

  it("Scale annualPriceCents is 24900 ($249/mo billed annually)", () => {
    const scale = PRICING_TIERS.find((t) => t.slug === "scale");
    expect(scale?.annualPriceCents).toBe(24900);
  });

  it("all priced public tiers have a maxHomes cap", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.maxHomes).not.toBeNull();
      expect(typeof tier.maxHomes).toBe("number");
    }
  });

  it("Starter maxHomes is 50", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.maxHomes).toBe(50);
  });

  it("Growth maxHomes is 200", () => {
    const growth = PRICING_TIERS.find((t) => t.slug === "growth");
    expect(growth?.maxHomes).toBe(200);
  });

  it("Scale maxHomes is 500", () => {
    const scale = PRICING_TIERS.find((t) => t.slug === "scale");
    expect(scale?.maxHomes).toBe(500);
  });

  it("exactly one tier is highlighted (Growth)", () => {
    const highlighted = PRICING_TIERS.filter((t) => t.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].slug).toBe("growth");
  });

  it("self-serve tiers have annualTotalPriceCents as a positive integer", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(typeof tier.annualTotalPriceCents).toBe("number");
      expect(tier.annualTotalPriceCents).toBeGreaterThan(0);
      expect(Number.isInteger(tier.annualTotalPriceCents)).toBe(true);
    }
  });

  it("annualTotalPriceCents equals annualPriceCents times 12", () => {
    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(tier.annualTotalPriceCents).toBe(
        (tier.annualPriceCents ?? 0) * 12,
      );
    }
  });

  it("Starter annualTotalPriceCents is 58800 ($49/mo times 12)", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.annualTotalPriceCents).toBe(58800);
  });

  it("Growth annualTotalPriceCents is 162000 ($135/mo times 12)", () => {
    const growth = PRICING_TIERS.find((t) => t.slug === "growth");
    expect(growth?.annualTotalPriceCents).toBe(162000);
  });

  it("Scale annualTotalPriceCents is 298800 ($249/mo times 12)", () => {
    const scale = PRICING_TIERS.find((t) => t.slug === "scale");
    expect(scale?.annualTotalPriceCents).toBe(298800);
  });

  it("all tiers have non-empty whoItsFor, outcome, and notIdealFor", () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.whoItsFor.length).toBeGreaterThan(0);
      expect(tier.outcome.length).toBeGreaterThan(0);
      expect(tier.notIdealFor.length).toBeGreaterThan(0);
    }
  });

  it("Starter whoItsFor targets single volunteer boards up to 50 homes", () => {
    const starter = PRICING_TIERS.find((t) => t.slug === "starter");
    expect(starter?.whoItsFor).toContain("50");
  });
});

describe("statutoryFeatures - category inference", () => {
  it("fund-separation: reserve/operating fund feature maps to fund-separation", () => {
    const f = findFeature(
      "starter",
      "Reserve/operating fund enforced separation",
    );
    expect(f?.category).toBe("fund-separation");
  });

  it("reserve-study: reserve-study deadline feature maps to reserve-study", () => {
    const f = findFeature("starter", "Reserve-study deadline tracking");
    expect(f?.category).toBe("reserve-study");
  });

  it("governance: 'Core homeowner directory and governance records' maps to governance (not owner-operations)", () => {
    const f = findFeature(
      "starter",
      "Core homeowner directory and governance records",
    );
    expect(f?.category).toBe("governance");
  });

  it("governance: 'Governance records with full audit trail on owner requests' maps to governance (not owner-operations)", () => {
    const f = findFeature("growth", "Governance records with full audit trail");
    expect(f?.category).toBe("governance");
  });

  it("owner-operations: 'Dues tracking and online payments' maps to owner-operations", () => {
    const f = findFeature("starter", "Dues tracking and online payments");
    expect(f?.category).toBe("owner-operations");
  });

  it("owner-operations: owner portal feature maps to owner-operations", () => {
    const f = findFeature("growth", "Owner portal with request visibility");
    expect(f?.category).toBe("owner-operations");
  });

  it("audit: general ledger feature maps to audit", () => {
    const f = findFeature("scale", "General ledger and core financial reports");
    expect(f?.category).toBe("audit");
  });

  it("audit: month-end close feature maps to audit", () => {
    const f = findFeature("scale", "Month-end close workflow");
    expect(f?.category).toBe("audit");
  });
});

describe("statutoryFeatures - citation extraction", () => {
  it("extracts full multi-state citation including nested parens (FL Section 720.303(7))", () => {
    const f = findFeature(
      "starter",
      "Reserve/operating fund enforced separation",
    );
    expect(f?.citation).toBe(
      "CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364",
    );
  });

  it("extracts owner-portal citation with nested paren (FL Section 720.303(5), CA Section 4525)", () => {
    const f = findFeature(
      "growth",
      "Owner portal with request visibility and audit-trail",
    );
    expect(f?.citation).toBe("FL Section 720.303(5), CA Section 4525");
  });

  it("returns undefined citation when feature label has no parentheses", () => {
    const f = findFeature("starter", "Reserve-study deadline tracking");
    expect(f?.citation).toBeUndefined();
  });

  it("returns undefined citation for board-user limit feature", () => {
    const f = findFeature("starter", "Up to 3 board users");
    expect(f?.citation).toBeUndefined();
  });

  it("nested-paren citation captures full span - greedy is required, not non-greedy", () => {
    // Label pattern: "Description (CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364)"
    // Non-greedy would stop at the first')' inside the citation, producing
    // "CA Section 5550, FL Section 720.303(7" - wrong. Greedy captures to the outer closing')'.
    const f = findFeature(
      "starter",
      "Reserve/operating fund enforced separation",
    );
    expect(f?.citation).toBe(
      "CA Section 5550, FL Section 720.303(7), WA RCW 64.34.364",
    );
    expect(f?.citation).not.toContain("Section 720.303(7\n");
    expect(f?.citation?.endsWith("WA RCW 64.34.364")).toBe(true);
  });
});

describe("shared positioning and funnel copy", () => {
  it("derives public URLs and sender identity from shared brand values", () => {
    expect(PUBLIC_WEB_URL).toBe("https://gavelhouse.app");
    expect(PUBLIC_APP_URL).toBe("https://my.gavelhouse.app");
    expect(PUBLIC_API_URL).toBe("https://api.gavelhouse.app");
    expect(BRAND_NOREPLY_EMAIL).toBe("angel.campa@gavelhouse.app");
    expect(BRAND_TRANSACTIONAL_SENDER).toBe(
      "Angel Campa <angel.campa@gavelhouse.app>",
    );
  });

  it("uses Start trial as the primary BOFU CTA text", () => {
    expect(FUNNEL_BOFU.ctaText).toBe("Start trial");
    expect(COPY.faq.bottomCtaText).toBe("Start trial");
  });

  it("keeps shared pricing copy focused on the trial and guarantee", () => {
    expect(FUNNEL_CTA_SUBTITLE).not.toContain("Y80OFF");
    expect(FUNNEL_CTA_SUBTITLE).toContain("Try Scale features first");
    expect(FUNNEL_CTA_SUBTITLE).toContain("Pick a plan later");
    expect(PRICING_CONFIG.promoCode).toBe("Y80OFF");
    expect(PRICING_CONFIG.promoText).toContain("Limited time offer");
    expect(PRICING_CONFIG.promoText).toContain("80% off the first year");
    expect(PRICING_CONFIG.promoText).toContain("M80OFF");
    expect(PRICING_CONFIG.promoText).toContain("Y80OFF");
    expect(PRICING_CONFIG.guaranteeText).toContain(
      "30-day money-back guarantee",
    );
    expect(PRICING_CONFIG.trialBannerText).toContain(
      "Annual billing is selected by default",
    );
  });

  it("derives product price ranges from shared pricing", () => {
    expect(PRODUCT_PRICE).toBe("$10-$50/mo billed annually with Y80OFF");
  });

  it("keeps the trial FAQ aligned to promo and guarantee access", () => {
    const trialFaq = FAQS.find((faq) => faq.q.includes("try Gavelhouse"));

    expect(trialFaq?.a).toContain("Start the trial");
    expect(trialFaq?.a).toContain("30-day money-back guarantee");
  });
});
