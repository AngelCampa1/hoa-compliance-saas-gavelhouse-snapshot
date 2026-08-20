import {
  KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO,
  formatKnowledgeDiscountedDisplayPriceRange,
  KNOWLEDGE_GUARANTEE_CONFIG,
} from "../knowledge/index.js";

export interface GavelhouseCompetitorData {
  name: string;
  slug: "gavelhouse";
  pricing: string;
  pros: string[];
  cons: string[];
}

export interface GavelhouseComparisonRow {
  label: string;
  gavelhouseValue: string;
}

export function getGavelhouseAsCompetitor(): GavelhouseCompetitorData {
  const starterAnnualDisplay = formatKnowledgeDiscountedDisplayPriceRange(
    ["starter"],
    "annual",
    KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO.percentOff,
  );
  const scaleAnnualDisplay = formatKnowledgeDiscountedDisplayPriceRange(
    ["scale"],
    "annual",
    KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO.percentOff,
  );

  return {
    name: "Gavelhouse",
    slug: "gavelhouse",
    pricing: `${starterAnnualDisplay} to ${scaleAnnualDisplay} billed annually with ${KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO.annual.code}, no per-unit fees. Portfolio is custom`,
    pros: [
      "Fund separation enforced at the database layer, so operating and reserve accounts cannot commingle",
      "State-specific reserve fund tracking built into the core workflow",
      "Flat pricing with no per-unit fees; predictable cost regardless of community size",
      `${KNOWLEDGE_GUARANTEE_CONFIG.days}-day money-back guarantee with no long-term contract required`,
    ],
    cons: [
      "Newer product with less third-party audit history than established platforms",
      "No native mobile app yet; web interface works on mobile browsers",
      "Portfolio is custom for multiple associations under one account",
    ],
  };
}

export function getGavelhouseComparisonRows(): GavelhouseComparisonRow[] {
  const { pricing } = getGavelhouseAsCompetitor();
  return [
    {
      label: "Price",
      gavelhouseValue: pricing,
    },
    {
      label: "Free trial",
      gavelhouseValue: `${KNOWLEDGE_GUARANTEE_CONFIG.days}-day money-back guarantee; cancel before the window closes to pay nothing`,
    },
    {
      label: "Fund separation",
      gavelhouseValue:
        "Enforced at the database layer, so operating and reserve funds cannot commingle",
    },
  ];
}
