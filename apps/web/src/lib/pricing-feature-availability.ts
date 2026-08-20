import { knowledgeBase, type MarketingPricingPlanId } from "@boardstack/shared";

type PricingPlan = (typeof knowledgeBase.marketing.pricing.plans)[number];
type PricingFeatureAvailabilityRow =
  (typeof knowledgeBase.marketing.pricing.featureAvailability)[number];

export type PricingTierId = MarketingPricingPlanId;

export type PricingFeatureAvailability = Record<PricingTierId, boolean>;

export function getPricingFeatureAvailability(
  featureRow: string,
  plans: readonly PricingPlan[] = knowledgeBase.marketing.pricing.plans,
  availabilityRows: readonly PricingFeatureAvailabilityRow[] = knowledgeBase
    .marketing.pricing.featureAvailability,
): PricingFeatureAvailability {
  const planIds = plans.map((plan) => plan.id as MarketingPricingPlanId);
  const availabilityRow = availabilityRows.find(
    (candidate) => candidate.label === featureRow,
  );

  if (!availabilityRow) {
    throw new Error(`Missing pricing feature availability: ${featureRow}`);
  }

  return Object.fromEntries(
    planIds.map((planId) => [planId, availabilityRow.availability[planId]]),
  ) as PricingFeatureAvailability;
}

export function getPricingFeatureRowsWithAvailability(
  rows: readonly string[] = knowledgeBase.marketing.pricing.featureRows,
  plans: readonly PricingPlan[] = knowledgeBase.marketing.pricing.plans,
  availabilityRows: readonly PricingFeatureAvailabilityRow[] = knowledgeBase
    .marketing.pricing.featureAvailability,
) {
  return rows.map((row) => ({
    label: row,
    featureAvailability: getPricingFeatureAvailability(
      row,
      plans,
      availabilityRows,
    ),
  }));
}
