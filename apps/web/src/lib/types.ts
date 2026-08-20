import type { CategoryStyle } from "./trust-signal-styles";

export interface PersonaDefinition {
  slug: string;
  label: string;
  description: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export interface ContentSource {
  title: string;
  source: string;
  url: string;
  lastChecked: string;
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

export interface SurveyQualificationRule {
  questionId: string;
  answers: string[];
}

export interface SurveyQualificationConfig {
  logic?: "any" | "all";
  rules: SurveyQualificationRule[];
}

export interface FunnelStage {
  ctaMode: "educate" | "evaluate" | "convert";
  ctaText: string;
  ctaTarget: string;
}

export interface CtaAnalyticsContext {
  pageFamily?: string;
  buyerStage?: BuyerStage;
  placement?: string;
  intent?: string;
  target?: string;
}

export interface CtaLinkConfig {
  text: string;
  target: string;
}

export interface DecisionCtaCardProps {
  heading: string;
  subtext: string;
  bullets?: string[];
  primaryCta: CtaLinkConfig;
  secondaryCta?: CtaLinkConfig;
  analytics?: CtaAnalyticsContext;
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

export interface FooterLinkGroup {
  heading: string;
  links: { label: string; href: string }[];
}

export interface FooterConfig {
  linkGroups: FooterLinkGroup[];
  legalLinks?: { label: string; href: string }[];
  emailCapture?: {
    heading?: string;
    buttonText?: string;
  };
}

export interface SiteAuthor {
  name: string;
  title?: string;
  url?: string;
  jobTitle?: string;
  sameAs?: readonly string[];
  credentials?: string;
}

export interface TrustSignal {
  text: string;
  category: "feature" | "roi" | "compliance" | "integration";
}

export type VisualProofConfig =
  | {
      type: "image";
      src: string;
      alt: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    }
  | {
      type: "video";
      src: string;
      alt?: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    }
  | {
      type: "embed";
      src: string;
      alt?: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    };

export interface ReferralReward {
  threshold: number;
  description: string;
}

export interface ReferralConfig {
  enabled: boolean;
  rewards: ReferralReward[];
}

export interface ProblemAgitationConfig {
  eyebrow?: string;
  heading: string;
  closingLine: string;
  painPoints: string[];
}

/**
 * Content lead magnet offered in the exit-intent popup.
 * `description` is rendered as the popup's body copy (sub-headline).
 * If not provided on a site, the popup falls back to confirmation copy.
 */
export interface LeadMagnet {
  /** Bare noun phrase - do NOT start with "Your" (the email subject prepends it automatically). E.g. "HOA Reserve Fund Checklist" not "Your HOA Reserve Fund Checklist". */
  title: string;
  description: string;
  slug?: string;
  teaser?: string;
  ctaText?: string;
}

export interface ResolvedLeadMagnetOffer {
  slug: string;
  title: string;
  description: string;
  ctaText: string;
  destination: string;
  teaser?: string;
}

/**
 * Controls exit-intent popup behavior at the site level.
 * The popup is enabled by default for all sites.
 * Set `enabled: false` to disable it for a specific site.
 * Note: the popup activates whenever `exitPopup?.enabled !== false`.
 * Copy overrides live in `SiteConfig.copy.exitPopup`.
 */
export interface ExitPopupConfig {
  enabled?: boolean;
}

export interface ExitPopupCopy {
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  /** Defaults to true. Set false to keep popup copy independent from site-level leadMagnet content. */
  showLeadMagnetContent?: boolean;
  declineText?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  loadingText?: string;
}

export interface CtaCopyBlock {
  heading: string;
  subtext: string;
  appointmentPrepNote?: string;
  buttonText?: string;
}

export interface HomepageProofCard {
  title: string;
  description: string;
}

export interface HomepageProofStack {
  outcome: HomepageProofCard;
  privacy: HomepageProofCard;
  appointmentPrep: HomepageProofCard;
}

export interface HomepageCopy {
  heroCtaText?: string;
  proofHeading?: string;
  proofBody?: string;
  proofStack?: HomepageProofStack;
  proofCards?: HomepageProofCard[];
  pricingHeading?: string;
  pricingBody?: string;
}

export type TrustSignalCategory =
  | "feature"
  | "roi"
  | "compliance"
  | "integration";

export type ThemeSurfaceStyle = "glass" | "flat" | "layered";
export type ThemeMotionIntensity = "none" | "subtle" | "balanced";
export type ThemeCtaStyle = "solid" | "soft" | "outline";
export type ThemeLayoutDensity = "compact" | "comfortable" | "airy";
export type ThemeChromeEmphasis = "subtle" | "balanced" | "strong";

export interface SiteTheme {
  primary: string;
  accent: string;
  surface?: string;
  text?: string;
  muted?: string;
  error?: string;
  success?: string;
  surfaceStyle?: ThemeSurfaceStyle;
  motionIntensity?: ThemeMotionIntensity;
  ctaStyle?: ThemeCtaStyle;
  layoutDensity?: ThemeLayoutDensity;
  chromeEmphasis?: ThemeChromeEmphasis;
  categoryColors?: Partial<Record<TrustSignalCategory, Partial<CategoryStyle>>>;
  fonts: {
    heading: string;
    body: string;
    mono?: string;
  };
}

export interface SiteConfig {
  name: string;
  domain: string;
  tagline: string;
  metaDescription?: string;
  preserveMetaTagCopy?: boolean;
  author?: SiteAuthor;
  /** Organization-level sameAs - social profiles and external mentions */
  sameAs?: string[];
  /** Contact email for Organization schema ContactPoint */
  contactEmail?: string;
  /** Privacy/DPA contact email -- displayed in privacy policy and DPA pages */
  privacyEmail?: string;
  /** Legal entity operating the product -- displayed on legal pages */
  legalEntity?: string;
  /** Geographic areas served - used in Organization schema */
  areaServed?: string[] | string;
  /** Default og:image path - used when no page-specific og:image is set */
  defaultOgImage?: string;
  /** Optional Apple touch icon path for iOS home screen shortcuts */
  appleTouchIcon?: string;
  /** URL path template for site search - enables WebSite SearchAction schema.
   *  The placeholder `{search_term_string}` must appear literally in the value.
   *  Example:"/search?q={search_term_string}" */
  searchPathTemplate?: string;

  theme: SiteTheme;

  product: {
    category: string;
    price: string;
    setupFee?: string;
    targetAudience: string;
    trustSignals: TrustSignal[];
  };

  comparisonFeatures?: string[];

  competitors: Competitor[];

  funnel: {
    tofu: FunnelStage;
    mofu: FunnelStage;
    bofu: FunnelStage;
    ctaSubtitle: string;
  };

  survey: {
    questions: SurveyQuestion[];
    qualification?: SurveyQualificationConfig;
  };

  faqs: FaqItem[];

  discoveryCallUrl: string;
  discoveryCallIncentive: string;

  problemAgitation: ProblemAgitationConfig;

  visualProof?: VisualProofConfig;

  referral: ReferralConfig;

  leadMagnet?: LeadMagnet;
  exitPopup?: ExitPopupConfig;

  nav?: {
    items: NavItem[];
  };

  footer?: FooterConfig;

  logo?: {
    light: string; // e.g.'/logo-light.svg'
  };

  /** Twitter/X handle for the site. Must include the @ prefix, e.g. "@boardstack". */
  social?: {
    twitterHandle?: string;
  };

  copy?: {
    emailCapture?: {
      privacyNote?: string;
      errorInvalidEmail?: string;
      errorDuplicate?: string;
      errorGeneric?: string;
      successMessage?: string;
      surveyPreview?: string;
      subtitle?: string;
      whatHappensNext?: string;
    };
    fakeDoorPricing?: {
      confirmationMessage?: string;
      buttonPrefix?: string;
      popularTier?: string;
      selectedMessages?: Record<string, string>;
    };
    survey?: {
      qualifiedHeading?: string;
      qualifiedBody?: string;
      qualifiedCtaText?: string;
      qualifiedDismissText?: string;
      unqualifiedHeading?: string;
      unqualifiedBody?: string;
      unqualifiedCtaText?: string;
      unqualifiedCtaTarget?: string;
      unqualifiedDismissText?: string;
    };
    funnelCta?: {
      trustNote?: string;
      subtitle?: string;
      benefitBullets?: string[];
      secondaryCta?: {
        text: string;
        target: string;
      };
    };
    inlineSignup?: {
      listicle?: CtaCopyBlock;
      guide?: CtaCopyBlock;
      symptom?: CtaCopyBlock;
      versus?: CtaCopyBlock;
      pricing?: CtaCopyBlock;
      compareHub?: CtaCopyBlock;
      alternativesHub?: CtaCopyBlock;
      statePage?: CtaCopyBlock;
    };
    homepage?: HomepageCopy;
    faq?: {
      bottomCtaHeading?: string;
      bottomCtaText?: string;
      bottomCtaTarget?: string;
    };
    exitPopup?: ExitPopupCopy;
  };

  socialProof?: Array<{ icon?: string; value: string; label: string }>;
  heroBenefits?: string[];
  heroTrustSignal?: string;
  pricingTiers?: PricingTier[];
  pricingUpdatedAt?: string;
  pricingConfig?: {
    trialBannerText?: string; // e.g. "30-day trial on all plans"
    annualSavingsText?: string; // e.g. "20% off annual"
    monthlyToggleLabel?: string; // defaults to "Monthly" in component
    annualToggleLabel?: string; // defaults to "Annual" in component
    lifetimeToggleLabel?: string; // defaults to "Lifetime" in component
    showBillingToggle?: boolean; // explicit opt-out; auto-detected from tiers by default
    promoCode?: string;
    promoText?: string;
    guaranteeText?: string;
  };
  heroCopy?: { subheadline: string };

  /** Analytics configuration. Defaults to enabled for all sites. Set `enabled: false` to opt out. */
  analytics?: {
    enabled?: boolean;
  };
}

export type PricingModel = "flat" | "per-user" | "per-unit" | "one-time";

export type StatutoryFeatureCategory =
  | "fund-separation"
  | "reserve-study"
  | "governance"
  | "owner-operations"
  | "audit";

export interface StatutoryFeature {
  /** Regulatory category this feature belongs to (used for grouped rows). */
  category: StatutoryFeatureCategory;
  /** Feature label (no statute citation, keep citation in `citation`). */
  label: string;
  /** Optional statute citation rendered in small-caps beneath the label. */
  citation?: string;
}

export interface PricingTier {
  name: string;
  /**
   * Compliance-scope framing for the tier header
   * (e.g. "Small-board compliance"). Shown as an italic kicker.
   */
  complianceScope?: string;
  slug?: string; // URL-safe identifier used in signup redirect, e.g. "starter"
  price: string; // monthly display string, e.g. "$59/mo"
  monthlyPriceCents?: number; // e.g. 9900 - enables annual toggle + computed price
  annualPriceCents?: number; // actual per-month price when billed annually, e.g. 4900 = $49/mo
  annualTotalPriceCents?: number; // total charge per year in cents, e.g. 58800 = $588/yr
  annualPriceOverride?: string; // optional custom annual display, e.g. "$24.99/yr"
  lifetimePriceOverride?: string; // optional lifetime display, e.g. "$59.99 lifetime"
  pricingModel?: PricingModel; // defaults to "flat" if omitted
  unitLabel?: string; // e.g."/user","/child" - appended to computed annual prices
  description?: string;
  features: string[];
  /**
   * Statute-aligned features used by the editorial comparison table.
   * When provided, the comparison layout groups rows by `category`.
   */
  statutoryFeatures?: StatutoryFeature[];
  highlighted?: boolean; // true = visually emphasized (border/scale treatment)
  ctaText?: string; // per-tier button text override
  /** Describes the ideal customer for this tier (e.g. "A single volunteer board..."). */
  whoItsFor: string;
  /** Key compliance outcome this tier delivers (e.g. "Fund separation + audit trail"). */
  outcome: string;
  /** Signals this tier is not the right fit (e.g. "Communities over 50 homes"). */
  notIdealFor: string;
}

export type BuyerStage = "tofu" | "mofu" | "bofu";
export type CtaMode = "educate" | "evaluate" | "convert";
export type SchemaType =
  | "Article"
  | "FAQPage"
  | "HowTo"
  | "Product"
  | "ItemList"
  | "BreadcrumbList"
  | "Organization"
  | "SoftwareApplication"
  | "WebSite"
  | "SearchAction";

export interface RelatedPage {
  title: string;
  href: string;
  description?: string;
}

export interface ContentItem {
  title: string;
  description: string;
  href: string;
  buyerStage: BuyerStage;
  publishedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  primaryKeyword?: string;
  searchIntent?: SearchIntent;
  sources?: ContentSource[];
  metadata?: Record<string, string>;
  featured?: boolean;
  relatedPages: RelatedPage[];
  canonical?: string;
  noindex?: boolean;
  targetPersona?: string[];
}

export interface CategorySummary {
  name: string;
  description: string;
  href: string;
  count: number;
}

export interface FilterDef {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface SortOption {
  value: string;
  label: string;
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}
