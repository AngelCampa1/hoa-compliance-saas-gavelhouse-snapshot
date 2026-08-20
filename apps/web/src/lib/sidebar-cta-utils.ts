import type { BuyerStage, CtaAnalyticsContext, SiteConfig } from "./types";

export interface SidebarCtaProps {
  ctaText: string;
  ctaTarget: string;
  subtitle?: string;
  bullets?: string[];
  trustNote?: string;
  analytics: CtaAnalyticsContext;
}

export function buildSidebarCtaProps(
  config: SiteConfig,
  stage: BuyerStage,
): SidebarCtaProps {
  const funnelStage = config.funnel[stage];
  return {
    ctaText: funnelStage.ctaText,
    ctaTarget: funnelStage.ctaTarget,
    subtitle: config.copy?.funnelCta?.subtitle,
    bullets: config.copy?.funnelCta?.benefitBullets,
    trustNote: config.copy?.funnelCta?.trustNote,
    analytics: {
      buyerStage: stage,
      intent: funnelStage.ctaMode,
      placement: "sidebar",
    },
  };
}
