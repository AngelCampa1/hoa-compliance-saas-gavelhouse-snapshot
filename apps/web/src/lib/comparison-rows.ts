import { knowledgeBase } from "@boardstack/shared";

export interface ComparisonRow {
  feature: string;
  values: string[];
}

const marketingKnowledge = knowledgeBase.marketing;

export function buildAlternativeComparisonRows(
  competitorPricing: string,
  competitorSetupFee: string | undefined,
  ownPrice: string,
): ComparisonRow[] {
  return [
    { feature: "Monthly cost", values: [competitorPricing, ownPrice] },
    {
      feature: "Setup fee",
      values: [
        competitorSetupFee ?? "Varies",
        marketingKnowledge.offer.setupFee,
      ],
    },
    {
      feature: "Reserve fund compliance",
      values: [
        "No",
        marketingKnowledge.capabilitiesById.reserveCompliance.shortAnswer,
      ],
    },
    {
      feature: "Fund accounting",
      values: [
        "No reserve separation",
        marketingKnowledge.capabilitiesById.fundAccounting.shortAnswer,
      ],
    },
    {
      feature: "Owner portal",
      values: [
        "Limited",
        marketingKnowledge.capabilitiesById.ownerPortal.shortAnswer,
      ],
    },
    {
      feature: "Built for",
      values: [
        "Professional management",
        marketingKnowledge.product.targetAudienceShort,
      ],
    },
  ];
}

export function buildVersusComparisonRows(
  pricingA: string,
  pricingB: string,
  ownPrice: string,
): ComparisonRow[] {
  return [
    { feature: "Monthly cost", values: [pricingA, pricingB, ownPrice] },
    {
      feature: "Reserve fund compliance",
      values: [
        "No",
        "No",
        marketingKnowledge.capabilitiesById.reserveCompliance.shortAnswer,
      ],
    },
    {
      feature: "Built for",
      values: [
        "Professional management",
        "Professional management",
        marketingKnowledge.product.targetAudienceShort,
      ],
    },
  ];
}

export function buildPricingComparisonRows(
  competitorPricing: string,
  ownPrice: string,
): ComparisonRow[] {
  return [
    { feature: "Monthly cost", values: [competitorPricing, ownPrice] },
    {
      feature: "Setup fee",
      values: ["Varies", marketingKnowledge.offer.setupFee],
    },
    {
      feature: "Contract",
      values: ["Varies", marketingKnowledge.offer.contract],
    },
  ];
}
