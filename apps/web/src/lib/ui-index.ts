/**
 * Public surface of @boardstack/web UI utilities.
 * Re-exports shared types, helpers, and icons used across components and pages.
 */
export type {
  SiteConfig,
  SiteAuthor,
  FaqItem,
  Competitor,
  SurveyQuestion,
  SurveyQualificationConfig,
  SurveyQualificationRule,
  FunnelStage,
  BuyerStage,
  CtaMode,
  SchemaType,
  NavItem,
  FooterLinkGroup,
  FooterConfig,
  ContentItem,
  RelatedPage,
  CategorySummary,
  FilterDef,
  SortOption,
  BreadcrumbItem,
  TrustSignal,
  VisualProofConfig,
  ReferralReward,
  ReferralConfig,
  ProblemAgitationConfig,
  PricingTier,
  TrustSignalCategory,
  CtaCopyBlock,
  HomepageProofCard,
  HomepageProofStack,
  HomepageCopy,
  LeadMagnet,
  ExitPopupConfig,
  ExitPopupCopy,
  PersonaDefinition,
} from "./types.js";
export { cn } from "./utils.js";
export {
  CheckIcon,
  CheckIconHidden,
  CrossIcon,
  CrossIconHidden,
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
} from "./icons.js";
export { pageUrl, getPageNumbers } from "./pagination.js";
export { toEmbedUrl } from "./video.js";
export {
  STAGE_BADGES,
  formatContentDate,
  filterMetadata,
} from "./content-helpers.js";
export type { StageBadge } from "./content-helpers.js";
export { CATEGORY_STYLES, CATEGORY_ICONS } from "./trust-signal-styles.js";
export type { CategoryStyle } from "./trust-signal-styles.js";
export {
  resolveOgImage,
  ensureTrailingSlash,
  resolveLandingTitle,
} from "./meta.js";
export { filterTocHeadings, shouldShowToc } from "./headings.js";
export type { TocHeading } from "./headings.js";
export {
  getCurrentYear,
  formatArticleDate,
  normalizeDateInput,
} from "./dates.js";
export {
  buildGoogleFontsUrl,
  buildFontCssOverrides,
  DEFAULT_FONTS,
} from "./fonts.js";
export {
  sortByUpdatedAtDesc,
  mapToContentItems,
  resolveCanonicalUrl,
  sumCategoryCounts,
  formatNumber,
} from "./collections.js";
export { lockScroll, unlockScroll } from "./scroll-lock.js";
export { buildFooterEmailCaptureProps } from "./footer-utils.js";
export type { FooterEmailCaptureProps } from "./footer-utils.js";
export { buildSidebarCtaProps } from "./sidebar-cta-utils.js";
export type { SidebarCtaProps } from "./sidebar-cta-utils.js";
export { resolveFaqHeading } from "./faq-utils.js";
export { resolveInlineSignupKicker } from "./inline-signup-utils.js";
export { initMobileNav } from "./mobile-nav.js";
export {
  trackEvent,
  identifyUser,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from "./analytics.js";
export type { PostHogInstance } from "./analytics.js";
export { buildGraph, withId, refId } from "./schema-graph.js";
export { createSitemapSerializer } from "./sitemap-utils.js";
