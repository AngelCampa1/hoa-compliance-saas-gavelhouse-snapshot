/**
 * Site configuration for gavelhouse.app, derived from the shared knowledge base.
 *
 * This file assembles the full SiteConfig object that Astro components expect.
 * Canonical Gavelhouse product, pricing, FAQ, competitor, and funnel facts live
 * in packages/shared/src/knowledge.
 */

import type { SiteConfig } from "../lib/types";
import {
  BRAND_AREA_SERVED,
  BRAND_AUTHOR,
  BRAND_DEFAULT_OG_IMAGE,
  BRAND_DISCOVERY_CALL_INCENTIVE,
  BRAND_DISCOVERY_CALL_URL,
  BRAND_LEGAL_ENTITY,
  BRAND_LOGO,
  BRAND_PRIVACY_EMAIL,
  BRAND_THEME,
  COPY,
  FOOTER_LEGAL_LINKS,
  FOOTER_LINK_GROUPS,
  LEAD_MAGNET,
  NAV_ITEMS,
  PROBLEM_AGITATION,
  REFERRAL_REWARDS,
  SURVEY_QUESTIONS,
  getDiscountedDisplayPrice,
  knowledgeBase,
} from "@boardstack/shared";
import type { Tier } from "@boardstack/shared";

const marketingKnowledge = knowledgeBase.marketing;

export const siteConfig = {
  name: marketingKnowledge.product.name,
  domain: marketingKnowledge.product.domain,
  defaultOgImage: BRAND_DEFAULT_OG_IMAGE,
  metaDescription: marketingKnowledge.product.description,
  contactEmail: marketingKnowledge.founderContact.email,
  privacyEmail: BRAND_PRIVACY_EMAIL,
  legalEntity: BRAND_LEGAL_ENTITY,
  areaServed: BRAND_AREA_SERVED,
  tagline: marketingKnowledge.product.tagline,
  author: BRAND_AUTHOR,
  logo: BRAND_LOGO,
  theme: BRAND_THEME,

  product: {
    category: marketingKnowledge.product.category,
    price: marketingKnowledge.pricing.displayRange,
    setupFee: marketingKnowledge.offer.setupFee,
    targetAudience: marketingKnowledge.product.targetAudience,
    trustSignals: [...marketingKnowledge.product.trustSignals],
  },

  competitors: marketingKnowledge.competitors.map((competitor) => ({
    slug: competitor.id,
    name: competitor.name,
    pricing: competitor.pricing,
    weakness: competitor.weakness,
    setupFee: competitor.setupFee,
  })),

  funnel: {
    tofu: marketingKnowledge.funnel.tofu,
    mofu: marketingKnowledge.funnel.mofu,
    bofu: marketingKnowledge.funnel.bofu,
    ctaSubtitle: marketingKnowledge.funnel.ctaSubtitle,
  },

  survey: {
    questions: SURVEY_QUESTIONS,
  },

  faqs: marketingKnowledge.faqs.map((faq) => ({
    q: faq.question,
    a: faq.answer,
  })),

  discoveryCallUrl: BRAND_DISCOVERY_CALL_URL,
  discoveryCallIncentive: BRAND_DISCOVERY_CALL_INCENTIVE,

  problemAgitation: PROBLEM_AGITATION,

  referral: {
    enabled: true,
    rewards: REFERRAL_REWARDS,
  },

  heroBenefits: [...marketingKnowledge.product.benefits],

  copy: {
    emailCapture: COPY.emailCapture,
    survey: COPY.survey,
    funnelCta: {
      ...COPY.funnelCta,
      benefitBullets: COPY.funnelCta.benefitBullets
        ? ([...COPY.funnelCta.benefitBullets] as string[])
        : undefined,
    },
    faq: COPY.faq,
    exitPopup: COPY.exitPopup,
  },

  leadMagnet: LEAD_MAGNET,

  pricingTiers: marketingKnowledge.pricing.plans.map((plan) => {
    const tier = plan.id as Tier;
    return {
      name: plan.name,
      complianceScope: plan.complianceScope,
      slug: plan.id,
      price: getDiscountedDisplayPrice(tier, "annual"),
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      annualTotalPriceCents: plan.annualTotalPriceCents,
      description: plan.description,
      features: plan.features,
      highlighted: plan.highlighted,
      whoItsFor: plan.whoItsFor,
      outcome: plan.outcome,
      notIdealFor: plan.notIdealFor,
    };
  }),

  pricingUpdatedAt: marketingKnowledge.pricing.updatedAt,
  pricingConfig: marketingKnowledge.pricing.config,

  nav: {
    items: NAV_ITEMS,
  },

  footer: {
    linkGroups: FOOTER_LINK_GROUPS,
    legalLinks: FOOTER_LEGAL_LINKS,
  },
} satisfies SiteConfig;
