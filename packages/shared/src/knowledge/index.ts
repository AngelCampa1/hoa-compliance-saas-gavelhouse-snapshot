import { z } from "zod";
import { appHelpSeed, marketingSeed } from "./seed-data.js";

const schemaVersionLiteral = "2026-05-knowledge-v1" as const;

const stringArraySchema = z.array(z.string());

const marketingPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  complianceScope: z.string().optional(),
  price: z.string(),
  monthlyPriceCents: z.number().int().nonnegative(),
  annualPriceCents: z.number().int().nonnegative(),
  annualTotalPriceCents: z.number().int().nonnegative(),
  description: z.string(),
  features: stringArraySchema,
  highlighted: z.boolean().optional(),
  maxHomes: z.number().int().positive().nullable(),
  whoItsFor: z.string(),
  outcome: z.string(),
  notIdealFor: z.string(),
});

const marketingKnowledgeSchema = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string(),
    category: z.string(),
    tagline: z.string(),
    description: z.string(),
    targetAudience: z.string(),
    targetAudienceShort: z.string(),
    benefits: stringArraySchema,
    trustSignals: z.array(
      z.object({
        text: z.string(),
        category: z.enum(["feature", "roi", "compliance", "integration"]),
      }),
    ),
  }),
  offer: z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    badgeLabel: z.string(),
    percentOff: z.number().int().nonnegative(),
    totalRedemptionLimit: z.number().int().positive(),
    monthly: z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      terms: z.string(),
      redemptionLimit: z.number().int().positive(),
    }),
    annual: z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      terms: z.string(),
      redemptionLimit: z.number().int().positive(),
    }),
    guaranteeDays: z.number().int().positive(),
    guaranteeLabel: z.string(),
    setupFee: z.string(),
    contract: z.string(),
  }),
  founderContact: z.object({
    email: z.string(),
    contactPath: z.string(),
  }),
  funnel: z.object({
    tofu: z.object({
      ctaMode: z.literal("educate"),
      ctaText: z.string(),
      ctaTarget: z.string(),
    }),
    mofu: z.object({
      ctaMode: z.literal("evaluate"),
      ctaText: z.string(),
      ctaTarget: z.string(),
    }),
    bofu: z.object({
      ctaMode: z.literal("convert"),
      ctaText: z.string(),
      ctaTarget: z.string(),
    }),
    ctaSubtitle: z.string(),
    publicSignupUrl: z.string(),
  }),
  pricing: z.object({
    updatedAt: z.string(),
    displayRange: z.string(),
    plans: z.array(marketingPlanSchema),
    config: z.object({
      trialBannerText: z.string(),
      annualSavingsText: z.string(),
      monthlyToggleLabel: z.string(),
      annualToggleLabel: z.string(),
      promoCode: z.string(),
      promoText: z.string(),
      guaranteeText: z.string(),
    }),
    featureRows: stringArraySchema,
    featureAvailability: z.array(
      z.object({
        label: z.string(),
        availability: z.record(z.boolean()),
      }),
    ),
    faqs: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
      }),
    ),
  }),
  faqs: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
  competitors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pricing: z.string(),
      weakness: z.string(),
      setupFee: z.string().optional(),
    }),
  ),
  capabilities: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      category: z.string(),
    }),
  ),
  capabilitiesById: z.object({
    reserveCompliance: z.object({
      shortAnswer: z.string(),
    }),
    fundAccounting: z.object({
      shortAnswer: z.string(),
    }),
    ownerPortal: z.object({
      shortAnswer: z.string(),
    }),
  }),
});

const appHelpSchema = z.object({
  help: z.object({
    version: z.string(),
    topics: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        category: z.enum([
          "start",
          "files",
          "finance",
          "governance",
          "reports",
          "owner-portal",
        ]),
        audience: z.enum(["board", "homeowner", "everyone"]),
        timeEstimate: z.string(),
        relatedRoutes: stringArraySchema,
        sections: z.array(
          z.object({
            heading: z.string(),
            body: z.string(),
            steps: stringArraySchema.optional(),
          }),
        ),
        glossaryTerms: stringArraySchema,
      }),
    ),
    rolePaths: z.array(
      z.object({
        id: z.string(),
        role: z.string(),
        summary: z.string(),
        firstSteps: stringArraySchema,
        href: z.string(),
      }),
    ),
    pageHelp: z.array(
      z.object({
        id: z.string(),
        routes: stringArraySchema,
        title: z.string(),
        purpose: z.string(),
        nextStep: z.string(),
        commonMistake: z.string(),
        href: z.string(),
      }),
    ),
    fieldHelp: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        body: z.string(),
        example: z.string().optional(),
      }),
    ),
    glossary: z.array(
      z.object({
        id: z.string(),
        term: z.string(),
        meaning: z.string(),
      }),
    ),
  }),
});

export const KNOWLEDGE_PRICING_PLANS = [
  {
    slug: "starter",
    monthlyPriceCents: 5900,
    annualTotalPriceCents: 58800,
    annualMonthlyDisplayPriceCents: 4900,
  },
  {
    slug: "growth",
    monthlyPriceCents: 16500,
    annualTotalPriceCents: 162000,
    annualMonthlyDisplayPriceCents: 13500,
  },
  {
    slug: "scale",
    monthlyPriceCents: 29900,
    annualTotalPriceCents: 298800,
    annualMonthlyDisplayPriceCents: 24900,
  },
] as const;

export const KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER = {
  id: "limited-80-off",
  shortLabel: "Limited time offer",
  offerLabel: "80% off the first year",
  badgeLabel: "80% off first year",
  percentOff: 80,
  totalRedemptionLimit: 300,
  monthly: {
    id: "M80OFF",
    name: "80% OFF - Monthly",
    code: "M80OFF",
    terms: "80% off your first year",
    redemptionLimit: 100,
  },
  annual: {
    id: "Y80OFF",
    name: "80% OFF - Yearly",
    code: "Y80OFF",
    terms: "80% off your first year",
    redemptionLimit: 200,
  },
} as const;

export const KNOWLEDGE_LIMITED_SUBSCRIPTION_PROMO =
  KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER;

export const KNOWLEDGE_GUARANTEE_CONFIG = {
  days: 30,
  label: "30-day money-back guarantee",
} as const;

function formatMonthlyDisplayPrice(cents: number, roundUp = false): string {
  const dollars = roundUp ? Math.ceil(cents / 100) : cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}/mo`;
}

function getKnowledgePricingPlan(slug: string) {
  const plan = KNOWLEDGE_PRICING_PLANS.find(
    (candidate) => candidate.slug === slug,
  );
  if (!plan) {
    throw new Error(`Missing pricing plan: ${slug}`);
  }
  return plan;
}

function getKnowledgePlanPriceCents(
  slug: string,
  cycle: "monthly" | "annual",
): number {
  const plan = getKnowledgePricingPlan(slug);
  return cycle === "annual"
    ? plan.annualMonthlyDisplayPriceCents
    : plan.monthlyPriceCents;
}

export function formatKnowledgeOriginalDisplayPrice(
  slug: string,
  cycle: "monthly" | "annual",
): string {
  return formatMonthlyDisplayPrice(getKnowledgePlanPriceCents(slug, cycle));
}

export function formatKnowledgeDiscountedDisplayPrice(
  slug: string,
  cycle: "monthly" | "annual",
  percentOff: number = KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.percentOff,
): string {
  const discountedCents =
    (getKnowledgePlanPriceCents(slug, cycle) * (100 - percentOff)) / 100;
  return formatMonthlyDisplayPrice(discountedCents, true);
}

export function formatKnowledgeOriginalDisplayPriceRange(
  slugs: readonly string[],
  cycle: "monthly" | "annual",
): string {
  if (slugs.length === 0) {
    throw new Error("Cannot format an empty pricing range");
  }

  const prices = slugs.map((slug) =>
    formatKnowledgeOriginalDisplayPrice(slug, cycle),
  );
  const first = prices[0].replace(/\/mo$/, "");
  const last = prices[prices.length - 1];
  return prices.length === 1 ? last : `${first}-${last}`;
}

export function formatKnowledgeDiscountedDisplayPriceRange(
  slugs: readonly string[],
  cycle: "monthly" | "annual",
  percentOff: number = KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.percentOff,
): string {
  if (slugs.length === 0) {
    throw new Error("Cannot format an empty pricing range");
  }

  const prices = slugs.map((slug) =>
    formatKnowledgeDiscountedDisplayPrice(slug, cycle, percentOff),
  );
  const first = prices[0]!.replace(/\/mo$/, "");
  const last = prices[prices.length - 1]!;
  return prices.length === 1 ? last : `${first}-${last}`;
}

export const marketingKnowledgeJsonSchema = z
  .object({
    schemaVersion: z.string(),
    domain: z.literal("marketing"),
  })
  .merge(marketingKnowledgeSchema);

export const appHelpKnowledgeJsonSchema = z
  .object({
    schemaVersion: z.string(),
    domain: z.literal("app"),
  })
  .merge(appHelpSchema);

export const fullKnowledgeJsonSchema = z.object({
  schemaVersion: z.string(),
  domains: z.object({
    marketing: marketingKnowledgeJsonSchema,
    app: appHelpKnowledgeJsonSchema,
  }),
});

const marketingKnowledgeSeed =
  marketingKnowledgeJsonSchema.parse(marketingSeed);
const appHelpKnowledgeSeed = appHelpKnowledgeJsonSchema.parse(appHelpSeed);
const marketingPricingFeatureAvailabilityByLabel = new Map(
  marketingKnowledgeSeed.pricing.featureAvailability.map((row) => [
    row.label,
    row.availability,
  ]),
);

function getMarketingPricingFeatureAvailability(
  label: MarketingPricingFeatureRow,
): MarketingPricingFeatureAvailability {
  return marketingPricingFeatureAvailabilityByLabel.get(
    label,
  ) as MarketingPricingFeatureAvailability;
}

export type MarketingKnowledgeJson = z.infer<
  typeof marketingKnowledgeJsonSchema
>;
export type AppHelpKnowledgeJson = z.infer<typeof appHelpKnowledgeJsonSchema>;
export type FullKnowledgeJson = z.infer<typeof fullKnowledgeJsonSchema>;

export const KNOWLEDGE_BRAND = {
  name: "Gavelhouse",
  domain: "gavelhouse.app",
  defaultOgImage: "/og-default.png",
  metaDescription:
    "Gavelhouse helps self-managed HOA and condo boards keep money, meetings, owners, and records in one clear place.",
  contactEmail: "angel.campa@gavelhouse.app",
  privacyEmail: "angel.campa@gavelhouse.app",
  legalEntity: "Angel Campa",
  areaServed: "United States",
  tagline: "Is your HOA reserve fund compliant?",
  twitterHandle: "@gavelhouse",
  discoveryCallUrl: "https://gavelhouse.app/contact/",
  discoveryCallIncentive: "Get a free walkthrough + extended trial",
  publicSignupUrl: "https://my.gavelhouse.app/signup",
  logo: {
    light: "/logo-light.svg",
  },
  theme: {
    primary: "#163a5f",
    accent: "#cb8a2e",
    surface: "#f6efe6",
    text: "#142235",
    muted: "#5d6b7d",
    error: "#c2412d",
    success: "#16735a",
    surfaceStyle: "layered",
    motionIntensity: "balanced",
    ctaStyle: "solid",
    layoutDensity: "airy",
    chromeEmphasis: "strong",
    fonts: {
      heading: "Libre Baskerville",
      body: "Public Sans",
      mono: "JetBrains Mono",
    },
  },
  author: {
    name: "Angel Campa",
    title: "Founder",
    url: "https://www.linkedin.com/in/angelcampa1/",
    jobTitle: "Founder",
    sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
  },
} as const;

export const KNOWLEDGE_PRODUCT = {
  category: "HOA Community Association Management",
  targetAudience: "Self-managed HOA and condo boards with up to 500 homes",
  trustSignals: [
    { text: "State rule tracking", category: "compliance" },
    { text: "Separate operating and reserve funds", category: "compliance" },
    {
      text: "Reports your board can read",
      category: "feature",
    },
    {
      text: "Meetings, votes, and owner work in one place",
      category: "feature",
    },
    {
      text: "Flat pricing your board can approve in one meeting",
      category: "roi",
    },
  ],
  heroBenefits: [
    "State rule tracking",
    "Finance, meetings, and owner work in one place",
    "Separate funds and clear reports",
    "Flat pricing with no per-unit fees",
  ],
} as const;

export const KNOWLEDGE_FUNNEL = {
  tofu: {
    ctaMode: "educate",
    ctaText: "See guides",
    ctaTarget: "/resources/",
  },
  mofu: {
    ctaMode: "evaluate",
    ctaText: "Compare tools",
    ctaTarget: "/compare/alternatives/payhoa/",
  },
  bofu: {
    ctaMode: "convert",
    ctaText: "Start trial",
    ctaTarget: KNOWLEDGE_BRAND.publicSignupUrl,
  },
  ctaSubtitle: "Try Scale features first. Pick a plan later.",
} as const;

export const MARKETING_PRICING_FEATURE_ROWS = [
  "Reserve/operating fund separation",
  "State compliance tracking",
  "Dues ledger",
  "Owner portal",
  "Board meetings and votes",
  "Architectural requests",
  "General ledger",
  "Audit packet exports",
  "Month-end close",
  "Priority support",
] as const;

export type MarketingPricingPlanId =
  (typeof KNOWLEDGE_PRICING_PLANS)[number]["slug"];

export type MarketingPricingFeatureRow =
  (typeof MARKETING_PRICING_FEATURE_ROWS)[number];

export type MarketingPricingFeatureAvailability = Record<
  MarketingPricingPlanId,
  boolean
>;

export const MARKETING_PRICING_FAQS = [
  {
    id: "is-pricing-per-door",
    question: "Is pricing per door?",
    answer: "No. Pricing is flat per community size and billed annually.",
  },
  {
    id: "can-we-try-it-before-the-board-commits",
    question: "Can we try it before the board commits?",
    answer:
      "Yes. Start the trial and evaluate the workflow before billing begins.",
  },
  {
    id: "what-happens-if-we-outgrow-a-tier",
    question: "What happens if we outgrow a tier?",
    answer:
      "Move to the tier that matches the community size. The record stays intact.",
  },
  {
    id: "do-you-give-legal-advice",
    question: "Do you give legal advice?",
    answer: "No. Gavelhouse is an operating tool, not legal counsel.",
  },
  {
    id: "can-we-export-records",
    question: "Can we export records?",
    answer: "Yes. You can export records for board review.",
  },
  {
    id: "who-answers-questions",
    question: "Who answers questions?",
    answer: `Email ${KNOWLEDGE_BRAND.contactEmail} and the builder answers.`,
  },
] as const;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const knowledgeBase = {
  schemaVersion: schemaVersionLiteral,
  marketing: {
    product: {
      id: "gavelhouse",
      name: KNOWLEDGE_BRAND.name,
      domain: KNOWLEDGE_BRAND.domain,
      category: KNOWLEDGE_PRODUCT.category,
      tagline: KNOWLEDGE_BRAND.tagline,
      description: KNOWLEDGE_BRAND.metaDescription,
      targetAudience: KNOWLEDGE_PRODUCT.targetAudience,
      targetAudienceShort: "Volunteer boards",
      benefits: KNOWLEDGE_PRODUCT.heroBenefits,
      trustSignals: KNOWLEDGE_PRODUCT.trustSignals,
    },
    offer: {
      id: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.id,
      code: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.code,
      label: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.offerLabel,
      badgeLabel: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.badgeLabel,
      percentOff: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.percentOff,
      totalRedemptionLimit:
        KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.totalRedemptionLimit,
      monthly: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly,
      annual: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual,
      guaranteeDays: KNOWLEDGE_GUARANTEE_CONFIG.days,
      guaranteeLabel: KNOWLEDGE_GUARANTEE_CONFIG.label,
      setupFee: "$0",
      contract: "Month-to-month",
    },
    founderContact: {
      email: KNOWLEDGE_BRAND.contactEmail,
      contactPath: "/contact/",
    },
    funnel: {
      tofu: KNOWLEDGE_FUNNEL.tofu,
      mofu: KNOWLEDGE_FUNNEL.mofu,
      bofu: KNOWLEDGE_FUNNEL.bofu,
      ctaSubtitle: KNOWLEDGE_FUNNEL.ctaSubtitle,
      publicSignupUrl: KNOWLEDGE_BRAND.publicSignupUrl,
    },
    pricing: {
      updatedAt: marketingKnowledgeSeed.pricing.updatedAt,
      displayRange: `${formatKnowledgeDiscountedDisplayPriceRange(
        ["starter", "scale"],
        "annual",
      )} billed annually with ${KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.code}`.replace(
        "$",
        "about $",
      ),
      plans: marketingKnowledgeSeed.pricing.plans.map((plan) => ({
        ...plan,
        price: formatKnowledgeDiscountedDisplayPrice(plan.id, "annual"),
      })),
      config: {
        trialBannerText:
          "The board keeps the record. Annual billing is selected by default.",
        annualSavingsText: "20% off annual",
        monthlyToggleLabel: "Monthly",
        annualToggleLabel: "Annual",
        promoCode: KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.code,
        promoText: `${KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.shortLabel}: ${KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.offerLabel}. Use ${KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.monthly.code} monthly or ${KNOWLEDGE_LIMITED_SUBSCRIPTION_OFFER.annual.code} yearly.`,
        guaranteeText: `${KNOWLEDGE_GUARANTEE_CONFIG.label}.`,
      },
      featureRows: MARKETING_PRICING_FEATURE_ROWS,
      featureAvailability: MARKETING_PRICING_FEATURE_ROWS.map((label) => ({
        label,
        availability: getMarketingPricingFeatureAvailability(label),
      })),
      faqs: MARKETING_PRICING_FAQS,
    },
    faqs: marketingKnowledgeSeed.faqs,
    competitors: marketingKnowledgeSeed.competitors,
    capabilities: KNOWLEDGE_PRODUCT.trustSignals.map((signal) => ({
      id: slugify(signal.text),
      text: signal.text,
      category: signal.category,
    })),
    capabilitiesById: {
      reserveCompliance: {
        shortAnswer: "Built-in, state-specific",
      },
      fundAccounting: {
        shortAnswer: "True fund isolation",
      },
      ownerPortal: {
        shortAnswer: "Full self-service",
      },
    },
  },
  app: {
    help: {
      ...appHelpKnowledgeSeed.help,
    },
  },
} as const;

export function buildMarketingKnowledgeJson(): MarketingKnowledgeJson {
  return marketingKnowledgeJsonSchema.parse({
    schemaVersion: knowledgeBase.schemaVersion,
    domain: "marketing",
    ...knowledgeBase.marketing,
  });
}

export function buildAppHelpKnowledgeJson(): AppHelpKnowledgeJson {
  return appHelpKnowledgeJsonSchema.parse({
    schemaVersion: knowledgeBase.schemaVersion,
    domain: "app",
    ...knowledgeBase.app,
  });
}

export function buildFullKnowledgeJson(): FullKnowledgeJson {
  return fullKnowledgeJsonSchema.parse({
    schemaVersion: knowledgeBase.schemaVersion,
    domains: {
      marketing: buildMarketingKnowledgeJson(),
      app: buildAppHelpKnowledgeJson(),
    },
  });
}

const unsafeKeyPattern =
  /(secret|token|password|passcode|authorization|api[_-]?key|env)/i;
const unsafeValuePattern =
  /\b(STRIPE_[A-Z0-9_]+|DATABASE_URL|LIVE_E2E_[A-Z0-9_]+|[A-Z0-9_]+_SECRET|[A-Z0-9_]+_TOKEN|[A-Z0-9_]+_API_KEY|sk_(?:live|test)_[A-Za-z0-9_]{16,}|pk_(?:live|test)_[A-Za-z0-9_]{16,}|ghp_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/i;
const unsafeUrlPattern =
  /\bhttps?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[::1\]|[^/\s]*staging[^/\s]*)(?::\d+|\/|\s|$)/i;
const unsafeOperationalPattern =
  /\b(internal deployment|deployment runbook|runbook|qa credentials?|qa credential names?|production qa|staging)\b/i;

export function getKnowledgeSafetyViolations(
  input: unknown,
  path: string[] = [],
): string[] {
  if (Array.isArray(input)) {
    return input.flatMap((item, index) =>
      getKnowledgeSafetyViolations(item, [...path, String(index)]),
    );
  }

  if (input && typeof input === "object") {
    return Object.entries(input).flatMap(([key, value]) => {
      const childPath = [...path, key];
      const keyViolations = unsafeKeyPattern.test(key)
        ? [`${childPath.join(".")}: unsafe key`]
        : [];
      return [
        ...keyViolations,
        ...getKnowledgeSafetyViolations(value, childPath),
      ];
    });
  }

  if (
    typeof input === "string" &&
    (unsafeValuePattern.test(input) ||
      unsafeUrlPattern.test(input) ||
      unsafeOperationalPattern.test(input))
  ) {
    return [`${path.join(".")}: unsafe value`];
  }

  return [];
}
