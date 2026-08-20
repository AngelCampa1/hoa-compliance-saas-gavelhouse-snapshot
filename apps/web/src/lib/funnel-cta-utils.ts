import type { BuyerStage, FunnelStage } from "./types";
import { sanitizePublicSignupCtaText } from "./public-signup-cta";

/**
 * Safely resolves the funnel configuration for a given buyer stage.
 * Returns null if the funnel object or the stage key is missing.
 */
export function resolveFunnelConfig(
  funnel: Record<BuyerStage, FunnelStage> | null | undefined,
  stage: BuyerStage,
): FunnelStage | null {
  if (!funnel) {
    return null;
  }
  const resolvedStage = funnel[stage];
  if (!resolvedStage) {
    return null;
  }

  return {
    ...resolvedStage,
    ctaText: sanitizePublicSignupCtaText(resolvedStage.ctaText),
  };
}
