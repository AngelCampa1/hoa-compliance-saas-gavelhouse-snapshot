import type { APIRoute } from "astro";
import { siteConfig } from "../config/site";
import { buildPricingTxt } from "../lib/pricing-txt";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    buildPricingTxt({
      productName: siteConfig.name,
      tiers: siteConfig.pricingTiers,
      updatedAt: siteConfig.pricingUpdatedAt,
      trialText: siteConfig.funnel.ctaSubtitle,
      promoText: siteConfig.pricingConfig?.promoText,
      guaranteeText: siteConfig.pricingConfig?.guaranteeText,
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
