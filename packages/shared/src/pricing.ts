import type { Tier } from "./billing/tiers.js";
import {
  KNOWLEDGE_GUARANTEE_CONFIG,
  KNOWLEDGE_PRICING_PLANS,
  KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER,
  formatKnowledgeDiscountedDisplayPrice,
  formatKnowledgeOriginalDisplayPrice,
  formatKnowledgeOriginalDisplayPriceRange,
} from "./knowledge/index.js";

export type PricingPlan = {
  slug: Tier;
  monthlyPriceCents: number;
  annualTotalPriceCents: number;
  annualMonthlyDisplayPriceCents: number;
};

export type LimitedSubscriptionOffer = {
  cycle: "monthly" | "annual";
  id: string;
  name: string;
  code: string;
  terms: string;
  redemptionLimit: number;
  stripeCouponId: string;
};

export const PRICING_PLANS: PricingPlan[] = KNOWLEDGE_PRICING_PLANS.map(
  (plan) => ({
    slug: plan.slug,
    monthlyPriceCents: plan.monthlyPriceCents,
    annualTotalPriceCents: plan.annualTotalPriceCents,
    annualMonthlyDisplayPriceCents: plan.annualMonthlyDisplayPriceCents,
  }),
);

export const LIMITED_SUBSCRIPTION_OFFERS = [
  {
    cycle: "monthly",
    ...KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly,
    stripeCouponId: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly.id,
  },
  {
    cycle: "annual",
    ...KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual,
    stripeCouponId: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.id,
  },
] as const satisfies readonly LimitedSubscriptionOffer[];

export const LIMITED_SUBSCRIPTION_PROMO = {
  ...KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER,
  monthly: {
    ...KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly,
    stripeCouponId: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly.id,
  },
  annual: {
    ...KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual,
    stripeCouponId: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.id,
  },
} as const;

export const GUARANTEE_CONFIG = KNOWLEDGE_GUARANTEE_CONFIG;

export function getPricingPlan(slug: Tier): PricingPlan {
  const plan = PRICING_PLANS.find((candidate) => candidate.slug === slug);
  if (!plan) {
    throw new Error(`Missing pricing plan: ${slug}`);
  }
  return plan;
}

export function getOriginalDisplayPrice(
  slug: Tier,
  cycle: "monthly" | "annual",
): string {
  return formatKnowledgeOriginalDisplayPrice(slug, cycle);
}

export function getDiscountedDisplayPrice(
  slug: Tier,
  cycle: "monthly" | "annual",
  percentOff?: number,
): string {
  return formatKnowledgeDiscountedDisplayPrice(slug, cycle, percentOff);
}

export function getDiscountedDisplayPriceRange(
  slugs: readonly Tier[],
  cycle: "monthly" | "annual",
  percentOff?: number,
): string {
  if (slugs.length === 0) {
    throw new Error("Cannot format an empty pricing range");
  }

  const prices = slugs.map((slug) =>
    getDiscountedDisplayPrice(slug, cycle, percentOff),
  );
  const first = prices[0]!.replace(/\/mo$/, "");
  const last = prices[prices.length - 1]!;
  return prices.length === 1 ? last : `${first}-${last}`;
}

export function getOriginalDisplayPriceRange(
  slugs: readonly Tier[],
  cycle: "monthly" | "annual",
): string {
  return formatKnowledgeOriginalDisplayPriceRange(slugs, cycle);
}

export function stripMonthlyPriceSuffix(price: string): string {
  return price.replace(/\/mo$/, "");
}

export function formatCurrencyCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(
      `formatCurrencyCents requires a finite number, received ${cents}`,
    );
  }
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function getLimitedOfferAnnualTotalCents(
  annualTotalPriceCents: number,
): number {
  return (
    Math.ceil(
      (annualTotalPriceCents * (100 - LIMITED_SUBSCRIPTION_PROMO.percentOff)) /
        10000,
    ) * 100
  );
}

export function getAnnualLimitedOfferBillingText(
  annualTotalPriceCents: number,
  annualDisplayPrice: string,
): string {
  return `${formatCurrencyCents(
    getLimitedOfferAnnualTotalCents(annualTotalPriceCents),
  )} per year with ${LIMITED_SUBSCRIPTION_PROMO.annual.code}; shown as about ${annualDisplayPrice}`;
}

export function getLimitedOfferUsageText(): string {
  return `Use ${LIMITED_SUBSCRIPTION_PROMO.annual.code} yearly or ${LIMITED_SUBSCRIPTION_PROMO.monthly.code} monthly for ${LIMITED_SUBSCRIPTION_PROMO.percentOff}% off your first year.`;
}

export function getAnnualPricingRangeLabel(slugs: readonly Tier[]): string {
  return `${getDiscountedDisplayPriceRange(slugs, "annual")} billed annually with ${LIMITED_SUBSCRIPTION_PROMO.annual.code}`;
}

export function getApproxAnnualPricingRangeLabel(
  slugs: readonly Tier[],
): string {
  return getAnnualPricingRangeLabel(slugs).replace("$", "about $");
}

export function getLimitedSubscriptionOffer(
  cycle: "monthly" | "annual",
): LimitedSubscriptionOffer {
  const offer = LIMITED_SUBSCRIPTION_OFFERS.find(
    (candidate) => candidate.cycle === cycle,
  );
  if (!offer) {
    throw new Error(
      `Unknown billing cycle for limited subscription offer: ${cycle}`,
    );
  }
  return offer;
}

export function isLimitedOfferActive(): boolean {
  return true;
}
