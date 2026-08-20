/**
 * Gavelhouse brand configuration - single source of truth for brand constants,
 * pricing tiers, competitors, survey questions, and funnel CTAs.
 *
 * Pure TypeScript - no framework imports.
 */

import {
  LIMITED_SUBSCRIPTION_PROMO,
  getAnnualPricingRangeLabel,
  getDiscountedDisplayPrice,
  getPricingPlan,
} from "./pricing.js";
import {
  KNOWLEDGE_BRAND,
  KNOWLEDGE_PRODUCT,
  knowledgeBase,
} from "./knowledge/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FaqItem {
  q: string;
  a: string;
}

export interface Competitor {
  slug: string;
  name: string;
  pricing: string;
  weakness: string;
  setupFee?: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface TrustSignal {
  text: string;
  category: "feature" | "roi" | "compliance" | "integration";
}

export interface NavMegaMenuLink {
  label: string;
  href: string;
  description?: string;
}

export interface NavMegaMenuSection {
  heading: string;
  links: NavMegaMenuLink[];
}

export interface NavItem {
  label: string;
  href: string;
  megaMenu?: NavMegaMenuSection[];
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterLinkGroup {
  heading: string;
  links: FooterLink[];
}

export interface StatutoryFeature {
  /** Category this feature belongs to (for grouped comparison rendering). */
  category:
    | "fund-separation"
    | "reserve-study"
    | "governance"
    | "owner-operations"
    | "audit";
  /** The feature description. */
  label: string;
  /** Optional statute citation rendered inline (e.g. "CA §5550"). */
  citation?: string;
}

export interface PricingTier {
  name: string;
  /**
   * Operating-scope framing shown above the tier name
   * (e.g. "Small board compliance"). Complements the plan slug.
   */
  complianceScope?: string;
  price: string;
  monthlyPriceCents: number;
  description: string;
  features: string[];
  /**
   * Statute-aligned feature list used by the editorial comparison
   * table. Grouped by regulatory category.
   */
  statutoryFeatures?: StatutoryFeature[];
  highlighted?: boolean;
  slug: "starter" | "growth" | "scale" | "portfolio";
  stripePriceMonthlyEnv: string;
  stripePriceAnnualEnv: string;
  annualPriceCents: number;
  annualTotalPriceCents: number;
  maxHomes: number | null;
  whoItsFor: string;
  outcome: string;
  notIdealFor: string;
  contactSales?: boolean;
  priceLabel?: string;
}

export interface ReferralReward {
  threshold: number;
  description: string;
}

export interface FunnelStage {
  ctaMode: "educate" | "evaluate" | "convert";
  ctaText: string;
  ctaTarget: string;
}

export interface ProblemAgitationConfig {
  heading: string;
  closingLine: string;
  painPoints: string[];
}

export interface LeadMagnet {
  title: string;
  description: string;
  slug: string;
}

export interface SiteTheme {
  primary: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
  error: string;
  success: string;
  surfaceStyle?: "glass" | "flat" | "layered";
  motionIntensity?: "none" | "subtle" | "balanced";
  ctaStyle?: "solid" | "soft" | "outline";
  layoutDensity?: "compact" | "comfortable" | "airy";
  chromeEmphasis?: "subtle" | "balanced" | "strong";
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
}

// ---------------------------------------------------------------------------
// Brand constants
// ---------------------------------------------------------------------------

export const BRAND_NAME = KNOWLEDGE_BRAND.name;
export const BRAND_DOMAIN = KNOWLEDGE_BRAND.domain;
export const BRAND_DEFAULT_OG_IMAGE = KNOWLEDGE_BRAND.defaultOgImage;
export const BRAND_META_DESCRIPTION = KNOWLEDGE_BRAND.metaDescription;
export const BRAND_CONTACT_EMAIL = KNOWLEDGE_BRAND.contactEmail;
export const BRAND_PRIVACY_EMAIL = KNOWLEDGE_BRAND.privacyEmail;
export const BRAND_LEGAL_ENTITY = KNOWLEDGE_BRAND.legalEntity;
export const BRAND_AREA_SERVED = KNOWLEDGE_BRAND.areaServed;
export const BRAND_TAGLINE = KNOWLEDGE_BRAND.tagline;
export const BRAND_TWITTER_HANDLE = KNOWLEDGE_BRAND.twitterHandle;
export const BRAND_DISCOVERY_CALL_URL = KNOWLEDGE_BRAND.discoveryCallUrl;
export const BRAND_DISCOVERY_CALL_INCENTIVE =
  KNOWLEDGE_BRAND.discoveryCallIncentive;
export const PUBLIC_SIGNUP_URL = KNOWLEDGE_BRAND.publicSignupUrl;
export const PUBLIC_WEB_URL = `https://${BRAND_DOMAIN}`;
export const PUBLIC_APP_URL = new URL(PUBLIC_SIGNUP_URL).origin;
export const PUBLIC_API_URL = `https://api.${BRAND_DOMAIN}`;
export const BRAND_NOREPLY_EMAIL = `angel.campa@${BRAND_DOMAIN}`;
export const BRAND_TRANSACTIONAL_SENDER = `Angel Campa <${BRAND_CONTACT_EMAIL}>`;

export const BRAND_LOGO = KNOWLEDGE_BRAND.logo;

export const BRAND_THEME: SiteTheme = KNOWLEDGE_BRAND.theme as SiteTheme;

export const BRAND_AUTHOR = KNOWLEDGE_BRAND.author;

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const PRODUCT_CATEGORY = KNOWLEDGE_PRODUCT.category;
export const PRODUCT_PRICE = getAnnualPricingRangeLabel(["starter", "scale"]);
export const PRODUCT_TARGET_AUDIENCE = KNOWLEDGE_PRODUCT.targetAudience;

export const TRUST_SIGNALS: TrustSignal[] = [...KNOWLEDGE_PRODUCT.trustSignals];

export const HERO_BENEFITS: string[] = [...KNOWLEDGE_PRODUCT.heroBenefits];

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export const COMPETITORS: Competitor[] = [
  {
    slug: "payhoa",
    name: "PayHOA",
    pricing: "$49/mo (<=25 units)",
    weakness:
      "No dedicated reserve study module, partial reserve tracking through accounting only",
  },
  {
    slug: "hoalife",
    name: "HOALife",
    pricing: "~$45-$95/mo",
    weakness: "Relies on QuickBooks for accounting",
  },
  {
    slug: "townsq",
    name: "TownSq",
    pricing: "$90/mo (<=300 units)",
    weakness: "Weak financials, reserve tracking only on Enterprise tier",
  },
  {
    slug: "condo-control",
    name: "Condo Control",
    pricing: "~$49/mo + per-unit modules",
    weakness:
      "Condo-focused, partial reserve tracking, no dedicated reserve study module",
  },
  {
    slug: "appfolio",
    name: "AppFolio",
    pricing: "$280/mo min + $0.80-$5/unit",
    weakness: "$280/mo minimum, built for mid-to-large management companies",
    setupFee: "$400+",
  },
  {
    slug: "buildium",
    name: "Buildium",
    pricing: "$62-$400/mo tiered",
    weakness:
      "Built for professional mgmt cos, 30-50% hidden fees on top of base price",
  },
  {
    slug: "cinc",
    name: "CINC Systems",
    pricing: "$250/mo minimum (quote-based)",
    weakness:
      "Enterprise only, quote-based pricing, not for self-managed boards",
  },
  {
    slug: "effortless-hoa",
    name: "Effortless HOA",
    pricing: "$3/home/mo",
    weakness: "Limited to small communities",
  },
  {
    slug: "moneyminder",
    name: "MoneyMinder",
    pricing: "Low cost",
    weakness: "No violation tracking, very basic",
  },
  {
    slug: "easyhoa",
    name: "EasyHOA",
    pricing: "$3/home/mo",
    weakness: "Basic accounting only, no reserve fund compliance",
  },
  {
    slug: "clickpay",
    name: "ClickPay",
    pricing: "Contact for pricing",
    weakness: "Payment processing only, no HOA management or reserve features",
  },
  {
    slug: "vantaca",
    name: "Vantaca",
    pricing: "$300-500+/mo (quote-based)",
    weakness:
      "Enterprise only for professional mgmt cos, not available to self-managed boards",
  },
  {
    slug: "runhoa",
    name: "RunHOA",
    pricing: "$399/year flat",
    weakness:
      "Zero reviews on G2/Capterra, no native mobile app, limited third-party validation",
  },
  {
    slug: "hoa-express",
    name: "HOA Express",
    pricing: "Free-$79/mo",
    weakness: "Website builder only, no accounting, no reserve fund tracking",
  },
  {
    slug: "enumerate",
    name: "Enumerate",
    pricing: "Quote-based",
    weakness:
      "Outdated interface, mixed reviews (3.8/5 Capterra), rebranded from TOPS in 2023",
  },
  {
    slug: "vinteum",
    name: "Vinteum",
    pricing: "$0.79-$1.99/unit/mo",
    weakness:
      "No native accounting, relies on QuickBooks integration, no reserve fund tracking",
  },
  {
    slug: "doorloop",
    name: "DoorLoop",
    pricing: "Contact for quote",
    weakness:
      "Primarily rental software, HOA features are secondary, per-unit pricing",
  },
];

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export const FUNNEL_TOFU: FunnelStage = {
  ctaMode: "educate",
  ctaText: "See guides",
  ctaTarget: "/resources/",
};

export const FUNNEL_MOFU: FunnelStage = {
  ctaMode: "evaluate",
  ctaText: "Compare tools",
  ctaTarget: "/compare/alternatives/payhoa/",
};

export const FUNNEL_BOFU: FunnelStage = {
  ctaMode: "convert",
  ctaText: "Start trial",
  ctaTarget: PUBLIC_SIGNUP_URL,
};

export const FUNNEL_CTA_SUBTITLE =
  "Try Scale features first. Pick a plan later." as const;

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "role",
    text: "What is your role on the board?",
    options: [
      "President",
      "Treasurer",
      "Secretary",
      "Board Member",
      "Property Manager",
    ],
  },
  {
    id: "current_tool",
    text: "What do you use to manage your HOA today?",
    options: [
      "QuickBooks",
      "Spreadsheets",
      "PayHOA",
      "HOALife",
      "Paper/Email",
      "Nothing",
    ],
  },
  {
    id: "pain",
    text: "What is your biggest headache?",
    options: [
      "Reserve fund compliance",
      "Collecting dues",
      "Violation tracking",
      "Communication with homeowners",
      "Accounting/bookkeeping",
    ],
  },
];

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export const FAQS: FaqItem[] = [
  {
    q: "How much does Gavelhouse cost?",
    a: "Annual billing is the default. With Y80OFF, Starter is about $10/mo, Growth is about $27/mo, and Scale is about $50/mo when billed annually. Monthly billing is available with M80OFF. There are no per-unit fees.",
  },
  {
    q: "Does Gavelhouse handle reserve fund compliance?",
    a: "Yes. Gavelhouse keeps reserve and operating money separate. It also keeps the board record easier to review.",
  },
  {
    q: "How long does setup take?",
    a: "Most boards can start the same day. Add owners, dues, and funds. Then use the board workflow.",
  },
  {
    q: "Do I need to sign an annual contract?",
    a: "No. Month-to-month. Cancel anytime. Use Y80OFF yearly or M80OFF monthly for 80% off your first year.",
  },
  {
    q: "What size community is Gavelhouse built for?",
    a: "Gavelhouse is for self-managed communities up to 500 homes.",
  },
  {
    q: "Can I try Gavelhouse before paying?",
    a: "Yes. Start the trial and keep the 30-day money-back guarantee.",
  },
];

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function inferStatutoryCategory(label: string): StatutoryFeature["category"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("fund")) return "fund-separation";
  if (normalized.includes("reserve")) return "reserve-study";
  if (normalized.includes("governance")) return "governance";
  if (
    normalized.includes("dues") ||
    normalized.includes("owner") ||
    normalized.includes("homeowner") ||
    normalized.includes("portal")
  ) {
    return "owner-operations";
  }
  if (
    normalized.includes("ledger") ||
    normalized.includes("audit") ||
    normalized.includes("close") ||
    normalized.includes("rollup") ||
    normalized.includes("compliance")
  ) {
    return "audit";
  }
  return "governance";
}

function toStatutoryFeature(label: string): StatutoryFeature {
  // Greedy is intentional: citations like "(CA §5550, FL §720.303(7))" contain
  // nested parens that a non-greedy match would truncate. Anchoring to $ ensures
  // we only capture a citation that closes the label, not mid-label parentheticals.
  const citationMatch = label.match(/\((.+)\)\s*$/);
  return {
    category: inferStatutoryCategory(label),
    label,
    citation: citationMatch?.[1],
  };
}

export const PRICING_TIERS: PricingTier[] =
  knowledgeBase.marketing.pricing.plans.map((plan) => {
    const slug = plan.id as PricingTier["slug"];
    const pricingPlan = getPricingPlan(slug);

    return {
      name: plan.name,
      complianceScope: plan.complianceScope,
      price: getDiscountedDisplayPrice(slug, "annual"),
      monthlyPriceCents: pricingPlan.monthlyPriceCents,
      description: plan.description,
      features: [...plan.features],
      statutoryFeatures: plan.features.map(toStatutoryFeature),
      highlighted: plan.highlighted,
      slug,
      stripePriceMonthlyEnv: `STRIPE_PRICE_${slug.toUpperCase()}_MONTHLY`,
      stripePriceAnnualEnv: `STRIPE_PRICE_${slug.toUpperCase()}_ANNUAL`,
      annualPriceCents: pricingPlan.annualMonthlyDisplayPriceCents,
      annualTotalPriceCents: pricingPlan.annualTotalPriceCents,
      maxHomes: plan.maxHomes,
      whoItsFor: plan.whoItsFor,
      outcome: plan.outcome,
      notIdealFor: plan.notIdealFor,
    };
  });

export const PRICING_CONFIG = {
  trialBannerText:
    "Your board owns the duty to manage funds. Keep that work with the board, not a management company. Annual billing is selected by default.",
  annualSavingsText: "20% off annual",
  monthlyToggleLabel: "Monthly",
  annualToggleLabel: "Annual",
  promoCode: LIMITED_SUBSCRIPTION_PROMO.annual.code,
  promoText: `${LIMITED_SUBSCRIPTION_PROMO.shortLabel}: ${LIMITED_SUBSCRIPTION_PROMO.offerLabel}. Use ${LIMITED_SUBSCRIPTION_PROMO.monthly.code} monthly or ${LIMITED_SUBSCRIPTION_PROMO.annual.code} yearly.`,
  guaranteeText: "30-day money-back guarantee.",
} as const;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const RESOURCE_MENU_SECTIONS: NavMegaMenuSection[] = [
  {
    heading: "Guides",
    links: [
      {
        label: "All Board Resources",
        href: "/resources/hubs/all-board-resources/",
        description: "Every public resource organized from one hub",
      },
      {
        label: "HOA Accounting",
        href: "/resources/hubs/hoa-accounting/",
        description: "Fund accounting, dues, collections, and reporting",
      },
      {
        label: "Reserve Studies",
        href: "/resources/hubs/reserve-studies/",
        description: "Reserve study, reserve fund, and compliance resources",
      },
    ],
  },
  {
    heading: "Software Roundups",
    links: [
      {
        label: "Software Buying",
        href: "/resources/hubs/software-buying/",
        description: "Roundups, comparisons, and buying guidance",
      },
      {
        label: "Software Roundups",
        href: "/resources/best/",
        description: "Expert roundups of the best HOA software by use case",
      },
      {
        label: "Self-Managed Boards",
        href: "/resources/hubs/self-managed-boards/",
        description: "Software and guidance for volunteer-run communities",
      },
    ],
  },
  {
    heading: "Free Tools & Templates",
    links: [
      {
        label: "Templates & Checklists",
        href: "/resources/hubs/free-templates-checklists/",
        description: "Downloadable templates, checklists, and planners",
      },
      {
        label: "Calculators",
        href: "/resources/hubs/calculators/",
        description: "Reserve, budget, pricing, and evaluation tools",
      },
      {
        label: "All Free Resources",
        href: "/free/",
        description: "Reserve calculators and compliance checklists",
      },
    ],
  },
  {
    heading: "Compliance",
    links: [
      {
        label: "State Compliance",
        href: "/resources/hubs/state-compliance/",
        description: "Reserve and governance rules by state",
      },
      {
        label: "California Compliance",
        href: "/resources/hubs/california-compliance/",
        description: "Davis-Stirling and California HOA resources",
      },
      {
        label: "Florida Compliance",
        href: "/resources/hubs/florida-compliance/",
        description: "Milestone inspection and Florida reserve resources",
      },
    ],
  },
  {
    heading: "Compare",
    links: [
      {
        label: "Software Comparisons",
        href: "/resources/hubs/software-comparisons/",
        description: "Alternatives, head-to-head, and pricing research",
      },
      {
        label: "All Comparisons",
        href: "/compare/",
        description: "Compare Gavelhouse with HOA software alternatives",
      },
      {
        label: "Pricing Breakdowns",
        href: "/compare/pricing/",
        description: "What HOA software actually costs",
      },
    ],
  },
  {
    heading: "Help",
    links: [
      {
        label: "Product help",
        href: "/resources/hubs/gavelhouse-product-help/",
        description: "Setup help and product workflows",
      },
      {
        label: "Help Center",
        href: "/help/",
        description: "Plain steps for common tasks",
      },
      {
        label: "State compliance",
        href: "/hoa-compliance/",
        description: "Rules by state",
      },
    ],
  },
];

export const PRODUCT_MENU_SECTIONS: NavMegaMenuSection[] = [
  {
    heading: "Product",
    links: [
      {
        label: "Product overview",
        href: "/product/",
        description: "See what Gavelhouse does",
      },
      {
        label: "Features",
        href: "/features/",
        description: "Finance, board work, owners, and upkeep",
      },
      {
        label: "Fund accounting",
        href: "/product/hoa-fund-accounting-software/",
        description: "Keep operating and reserve money apart",
      },
      {
        label: "Owner portal",
        href: "/product/hoa-owner-portal-software/",
        description: "Give owners a clear place to look",
      },
    ],
  },
  {
    heading: "Board roles",
    links: [
      {
        label: "Board members",
        href: "/solutions/hoa-board-member-software/",
        description: "Run the board with fewer loose files",
      },
      {
        label: "Treasurer",
        href: "/solutions/hoa-treasurer-software/",
        description: "Keep money records clear",
      },
      {
        label: "President",
        href: "/solutions/hoa-board-president-software/",
        description: "Lead meetings and track votes",
      },
      {
        label: "Secretary",
        href: "/solutions/hoa-board-secretary-software/",
        description: "Keep minutes and records together",
      },
    ],
  },
  {
    heading: "Your situation",
    links: [
      {
        label: "Just fired your management company",
        href: "/solutions/self-managing-hoa-after-management-company/",
        description: "Start self-management with less mess",
      },
      {
        label: "Small self-managed HOA",
        href: "/solutions/small-self-managed-hoa-software/",
        description: "For volunteer boards",
      },
      {
        label: "Condo board",
        href: "/solutions/condo-board-software/",
        description: "Keep condo board work clear",
      },
      {
        label: "Self-management platform",
        href: "/solutions/hoa-self-management-platform/",
        description: "One place for daily board work",
      },
    ],
  },
  {
    heading: "Risk and compliance",
    links: [
      {
        label: "Treasurer liability",
        href: "/solutions/hoa-treasurer-liability-software/",
        description: "Keep fund records clean",
      },
      {
        label: "HOA audit prep",
        href: "/solutions/hoa-audit-software/",
        description: "Find the records you need",
      },
      {
        label: "Fannie Mae reserve compliance",
        href: "/solutions/fannie-mae-reserve-compliance-software/",
        description: "Keep reserve records easier to review",
      },
      {
        label: "HOA compliance",
        href: "/solutions/hoa-compliance-software/",
        description: "Separate funds in the ledger",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Product",
    href: "/product/",
    megaMenu: PRODUCT_MENU_SECTIONS,
  },
  {
    label: "Resources",
    href: "/resources/",
    megaMenu: RESOURCE_MENU_SECTIONS,
  },
  { label: "Pricing", href: "/pricing/" },
  { label: "About", href: "/about/" },
];

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: "Product",
    links: [
      { label: "Product overview", href: "/product/" },
      {
        label: "Financial reporting",
        href: "/product/hoa-financial-reporting-software/",
      },
      {
        label: "Governance workflows",
        href: "/product/hoa-governance-workflow-software/",
      },
      {
        label: "Owner portal",
        href: "/product/hoa-owner-portal-software/",
      },
      { label: "Help center", href: "/help/" },
      { label: "Pricing", href: "/pricing/" },
    ],
  },
  {
    heading: "Who it's for",
    links: [
      { label: "Treasurer", href: "/solutions/hoa-treasurer-software/" },
      {
        label: "Treasurer liability",
        href: "/solutions/hoa-treasurer-liability-software/",
      },
      {
        label: "Board president",
        href: "/solutions/hoa-board-president-software/",
      },
      { label: "Condo board", href: "/solutions/condo-board-software/" },
      {
        label: "Self-managed HOA",
        href: "/solutions/small-self-managed-hoa-software/",
      },
      {
        label: "HOA compliance",
        href: "/solutions/hoa-compliance-software/",
      },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "All Resources", href: "/resources/" },
      { label: "HOA Guides", href: "/resources/guides/" },
      { label: "Best Software Lists", href: "/resources/best/" },
      { label: "Free Tools", href: "/free/" },
      { label: "Compliance by State", href: "/hoa-compliance/" },
      { label: "Compare", href: "/compare/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "Help Center", href: "/help/" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about/" },
      { label: "Contact", href: "/contact/" },
    ],
  },
];

export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { label: "Privacy Policy", href: "/privacy/" },
  { label: "Terms of Service", href: "/terms/" },
  { label: "DPA", href: "/dpa/" },
  { label: "Subprocessors", href: "/subprocessors/" },
];

// ---------------------------------------------------------------------------
// Problem agitation
// ---------------------------------------------------------------------------

export const PROBLEM_AGITATION: ProblemAgitationConfig = {
  heading:
    "Too many self-managed HOAs still run on spreadsheets and QuickBooks.",
  closingLine: "Here's how Gavelhouse fixes it.",
  painPoints: [
    "QuickBooks cannot keep operating and reserve money apart. Mixing the two breaks reserve rules in states like California, Florida, New Jersey, Maryland, and Washington. Boards that commingle funds can face member lawsuits and personal liability.",
    "Messy finances push many volunteer boards to hand control to a management company. The right tool helps your board stay on its own.",
    "Florida banned reserve waivers for structural components. New Jersey requires baseline funding that never drops below zero. Fannie Mae is raising its reserve floor to 15% on January 4, 2027 (Lender Letter LL-2026-03). Do you know your state's rules?",
  ],
};

// ---------------------------------------------------------------------------
// Referral
// ---------------------------------------------------------------------------

export const REFERRAL_REWARDS: ReferralReward[] = [
  { threshold: 3, description: "Get 7 extra days on your free trial" },
  { threshold: 10, description: "Get 30 extra days on your free trial" },
];

// ---------------------------------------------------------------------------
// Lead magnet
// ---------------------------------------------------------------------------

export const LEAD_MAGNET: LeadMagnet = {
  title: "50-State HOA Reserve Fund Requirements Guide",
  description:
    "Every state's reserve study and funding requirements in one reference. Statutes, deadlines, penalties, and the Fannie Mae changes taking effect January 4, 2027.",
  slug: "50-state-reserve-fund-requirements",
};

// ---------------------------------------------------------------------------
// Copy overrides
// ---------------------------------------------------------------------------

export const COPY = {
  emailCapture: {
    subtitle: "Try Scale features first. Pick a plan later.",
    whatHappensNext: "We'll send your access link.",
    surveyPreview:
      "Quick 3 questions to help shape the product. Takes 30 seconds.",
  },
  survey: {
    unqualifiedCtaText: "Explore our guides",
    unqualifiedCtaTarget: "/resources/",
  },
  funnelCta: {
    subtitle: "Try Scale features first. Pick a plan later.",
    benefitBullets: [
      "Clear fund records",
      "Reports your board can read",
      "Meetings, votes, and owner work",
    ],
  },
  faq: {
    bottomCtaHeading: "Ready to try the board workflow?",
    bottomCtaText: "Start trial",
    bottomCtaTarget: PUBLIC_SIGNUP_URL,
  },
  exitPopup: {
    headline: "Get this free download before you go",
    description:
      "Every state's reserve study and funding requirements in one reference. Statutes, deadlines, penalties, and the Fannie Mae changes taking effect January 4, 2027.",
    ctaText: "Send it to me",
    leftPanelLabel: "FREE DOWNLOAD",
    successSubMessage: "Check your inbox. Your download is on the way.",
  },
} as const;
