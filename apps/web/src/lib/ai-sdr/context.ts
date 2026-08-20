import { PUBLIC_WEB_URL, knowledgeBase } from "@boardstack/shared";

// The product id Gavelhouse is registered under in the shared AI-SDR worker's
// AI_SDR_CONTEXT_ENDPOINTS map. Must match the productId the browser widget
// sends on POST /v1/sessions and the one the worker echoes back when it fetches
// signed product context.
export const AI_SDR_PRODUCT_ID = "gavelhouse";

const SITE_ORIGIN = PUBLIC_WEB_URL;

export interface AiSdrSource {
  id: string;
  title: string;
  url: string;
  excerpt: string;
}

export interface AiSdrPlan {
  id: string;
  name: string;
  price: string;
  sizeBand: string;
  defaultCadence: "year";
  trialDays: number;
  discount: string;
  ctaUrl: string;
  features: string[];
}

export interface AiSdrContext {
  productId: string;
  name: string;
  description: string;
  sources: AiSdrSource[];
  plans: AiSdrPlan[];
}

// Builds the grounded product context the AI-SDR worker uses to answer
// prospect questions about Gavelhouse. Everything is sourced from
// `@boardstack/shared` knowledge so pricing/positioning never drifts from the
// marketing site (enforced by the shared knowledge audits).
export function buildAiSdrContext(): AiSdrContext {
  const marketing = knowledgeBase.marketing;
  const offer = marketing.offer;

  const sources: AiSdrSource[] = [
    {
      id: "product-overview",
      title: `${marketing.product.name} overview`,
      url: `${SITE_ORIGIN}/`,
      excerpt: marketing.product.description,
    },
    {
      id: "who-its-for",
      title: "Who Gavelhouse is for",
      url: `${SITE_ORIGIN}/`,
      excerpt: marketing.product.targetAudience,
    },
    {
      id: "pricing-overview",
      title: "Pricing",
      url: `${SITE_ORIGIN}/pricing/`,
      excerpt: `${marketing.pricing.displayRange}. ${offer.label} with ${offer.code}. ${offer.guaranteeLabel}. Setup fee: ${offer.setupFee}. ${offer.contract}.`,
    },
    ...marketing.pricing.faqs.map((faq) => ({
      id: faq.id,
      title: faq.question,
      url: `${SITE_ORIGIN}/pricing/`,
      excerpt: faq.answer,
    })),
    {
      id: "founder-contact",
      title: "Founder contact",
      url: `${SITE_ORIGIN}${marketing.founderContact.contactPath}`,
      excerpt: `Talk to the founder: ${marketing.founderContact.email}.`,
    },
  ];

  const plans: AiSdrPlan[] = marketing.pricing.plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: `${plan.price} billed annually with ${offer.code}`,
    sizeBand: plan.description,
    defaultCadence: "year",
    trialDays: offer.guaranteeDays,
    discount: `${offer.code}: ${offer.label}`,
    ctaUrl: marketing.funnel.publicSignupUrl,
    features: plan.features.slice(0, 4),
  }));

  return {
    productId: AI_SDR_PRODUCT_ID,
    name: marketing.product.name,
    description: marketing.product.description,
    sources,
    plans,
  };
}
