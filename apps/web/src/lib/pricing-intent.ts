import type { PricingTier } from "./types";

function normalizeTierToken(value: string): string {
  return value.trim().toLowerCase();
}

export function getPricingIntentTierFromHref(href: string): string | undefined {
  const url = new URL(href, "https://validation.local");
  const plan = url.searchParams.get("plan");
  if (!plan) return undefined;

  const normalizedPlan = normalizeTierToken(plan);
  return normalizedPlan.length > 0 ? normalizedPlan : undefined;
}

export function findPricingIntentTierFromSearch(
  search: string,
  tiers: Pick<PricingTier, "name">[],
): string | undefined {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const plan = params.get("plan");
  if (!plan) return undefined;

  const normalizedPlan = normalizeTierToken(plan);
  if (normalizedPlan.length === 0) return undefined;

  return tiers.find((tier) => normalizeTierToken(tier.name) === normalizedPlan)
    ?.name;
}
