import {
  useState,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactElement,
} from "react";
import type {
  PricingTier,
  StatutoryFeature,
  StatutoryFeatureCategory,
} from "../lib/types";
import { EmailCapture } from "./email-capture";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException, captureHttpError } from "../lib/sentry-client";
import {
  formatAnnualMonthlyEquivalent,
  formatAnnualPerMonthPrice,
} from "../lib/pricing-utils";
import { trackBillingToggle } from "../lib/billing-toggle-tracker";
import { findPricingIntentTierFromSearch } from "../lib/pricing-intent";
import { sanitizePublicSignupMessage } from "../lib/public-signup-cta";
import type { PublicSignupFlowConfig } from "../lib/public-signup-flow";
import {
  PricingPromoAssurance,
  type PricingPromoAssuranceProps,
} from "./pricing-promo-assurance";

export interface FakeDoorEmailCaptureProps extends PublicSignupFlowConfig {
  apiUrl?: string;
  sourcePage?: string;
  ariaLabel?: string;
  buttonText?: string;
  placeholder?: string;
}

interface FakeDoorPricingProps {
  apiUrl: string;
  appUrl?: string;
  sourcePage: string;
  tiers: PricingTier[];
  onTierClick?: () => void;
  confirmationMessage?: string;
  buttonPrefix?: string;
  heading?: string;
  popularTier?: string;
  popularBadgeText?: string;
  selectedBadgeText?: string;
  recommendedBadgeText?: string;
  socialProofText?: string;
  selectedMessages?: Record<string, string>;
  emailCapture?: FakeDoorEmailCaptureProps;
  emailCaptureConfigUrl?: string;
  clearButtonText?: string;
  modalAriaLabel?: string;
  trialBannerText?: string;
  annualSavingsText?: string;
  monthlyToggleLabel?: string;
  annualToggleLabel?: string;
  lifetimeToggleLabel?: string;
  showBillingToggle?: boolean;
  promoAssurance?: PricingPromoAssuranceProps;
}

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getAnnualPriceDisplay(tier: PricingTier): string {
  if (tier.annualPriceOverride) return tier.annualPriceOverride;
  if (tier.annualPriceCents !== undefined) {
    return formatAnnualPerMonthPrice(tier.annualPriceCents, tier.unitLabel);
  }
  if (tier.monthlyPriceCents !== undefined) {
    return formatAnnualMonthlyEquivalent(
      tier.monthlyPriceCents,
      tier.unitLabel,
    );
  }
  return tier.price;
}

function getLifetimePriceDisplay(tier: PricingTier): string {
  return tier.lifetimePriceOverride ?? tier.price;
}

const COMPLIANCE_CATEGORY_ORDER: StatutoryFeatureCategory[] = [
  "fund-separation",
  "reserve-study",
  "governance",
  "owner-operations",
  "audit",
];

const COMPLIANCE_CATEGORY_LABELS: Record<StatutoryFeatureCategory, string> = {
  "fund-separation": "Fund separation",
  "reserve-study": "State reserve-study support",
  governance: "Governance record",
  "owner-operations": "Owner operations",
  audit: "Audit-grade reporting",
};

interface CategorySection {
  category: StatutoryFeatureCategory;
  label: string;
  /**
   * Feature rows keyed by tier name. A missing tier key means the tier does
   * not include that feature in this category - rendered as an empty cell.
   */
  rows: Array<{
    key: string;
    features: Record<string, StatutoryFeature>;
  }>;
}

/**
 * Group every tier's statutoryFeatures by category and align them into rows
 * so the editorial comparison table can render category headers with rows
 * beneath. Rows are not deduped across tiers - each tier's feature shows in
 * its own cell even if the label differs, so the reader sees the actual
 * language each tier delivers.
 */
function buildCategorySections(tiers: PricingTier[]): CategorySection[] {
  const perCategory = new Map<
    StatutoryFeatureCategory,
    Array<{
      key: string;
      features: Record<string, StatutoryFeature>;
    }>
  >();

  for (const tier of tiers) {
    const features = tier.statutoryFeatures ?? [];
    const indexInCategory = new Map<StatutoryFeatureCategory, number>();
    for (const feat of features) {
      const existing = perCategory.get(feat.category) ?? [];
      const idx = indexInCategory.get(feat.category) ?? 0;
      indexInCategory.set(feat.category, idx + 1);
      const row = existing[idx] ?? {
        key: `${feat.category}-${idx}`,
        features: {},
      };
      row.features[tier.name] = feat;
      if (!existing[idx]) {
        existing.push(row);
        perCategory.set(feat.category, existing);
      }
    }
  }

  const sections: CategorySection[] = [];
  for (const category of COMPLIANCE_CATEGORY_ORDER) {
    const rows = perCategory.get(category);
    if (!rows || rows.length === 0) continue;
    sections.push({
      category,
      label: COMPLIANCE_CATEGORY_LABELS[category],
      rows,
    });
  }
  return sections;
}

async function sendPricingClick(
  url: string,
  payload: {
    tier: string;
    sourcePage: string;
    sessionId: string;
    billingPeriod: "monthly" | "annual" | "lifetime";
  },
): Promise<void> {
  const body = JSON.stringify(payload);

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) {
      return;
    }
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export function FakeDoorPricing({
  apiUrl,
  appUrl,
  sourcePage,
  tiers,
  onTierClick,
  confirmationMessage,
  buttonPrefix,
  heading,
  popularTier,
  popularBadgeText = "Most Popular",
  selectedBadgeText = "Selected",
  recommendedBadgeText = "RECOMMENDED",
  socialProofText,
  selectedMessages,
  emailCapture,
  emailCaptureConfigUrl,
  clearButtonText = "Clear",
  modalAriaLabel = "Choose your plan and continue",
  trialBannerText,
  annualSavingsText,
  monthlyToggleLabel,
  annualToggleLabel,
  lifetimeToggleLabel,
  showBillingToggle,
  promoAssurance,
}: FakeDoorPricingProps) {
  const [sessionId, setSessionId] = useState("");
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [lastSelectedTier, setLastSelectedTier] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadedEmailCapture, setLoadedEmailCapture] =
    useState<FakeDoorEmailCaptureProps | null>(null);
  const [isLoadingEmailCapture, setIsLoadingEmailCapture] = useState(false);
  const [emailCaptureLoadError, setEmailCaptureLoadError] = useState<
    string | null
  >(null);
  const [billingPeriod, setBillingPeriod] = useState<
    "monthly" | "annual" | "lifetime"
  >("annual");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasHandledUrlIntentRef = useRef(false);
  const emailCaptureRequestRef =
    useRef<Promise<FakeDoorEmailCaptureProps | null> | null>(null);

  const resolvedEmailCapture = emailCapture ?? loadedEmailCapture;
  const hasEmailCaptureFlow = Boolean(emailCapture || emailCaptureConfigUrl);
  const resolvedQualification =
    resolvedEmailCapture?.qualification ??
    resolvedEmailCapture?.surveyQualification;

  const hasAnnualBilling = tiers.some(
    (tier) => tier.monthlyPriceCents !== undefined,
  );
  const hasLifetimeBilling = tiers.some(
    (tier) => tier.lifetimePriceOverride !== undefined,
  );
  const canShowToggle =
    showBillingToggle !== false &&
    (hasAnnualBilling || hasLifetimeBilling) &&
    !tiers.every((t) => t.pricingModel === "one-time");

  function closeModal() {
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  function clearSelection() {
    setSelectedTiers(new Set());
    setLastSelectedTier(null);
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  async function loadEmailCaptureConfig(): Promise<FakeDoorEmailCaptureProps | null> {
    if (emailCapture) {
      setEmailCaptureLoadError(null);
      return emailCapture;
    }
    if (loadedEmailCapture) {
      setEmailCaptureLoadError(null);
      return loadedEmailCapture;
    }
    if (!emailCaptureRequestRef.current) {
      setIsLoadingEmailCapture(true);
      setEmailCaptureLoadError(null);
      emailCaptureRequestRef.current = (async () => {
        // emailCaptureConfigUrl is defined here: emailCapture was falsy (checked above),
        // so hasEmailCaptureFlow requires emailCaptureConfigUrl to be truthy.
        const configUrl = emailCaptureConfigUrl!;
        const response = await fetch(configUrl);
        if (!response.ok) {
          captureHttpError(response.status, {
            tags: { source: "fake-door-pricing-config" },
            extra: { sourcePage },
          });
          throw Object.assign(
            new Error(`Failed to load email capture config from ${configUrl}`),
            { status: response.status },
          );
        }
        const config = (await response.json()) as FakeDoorEmailCaptureProps;
        setLoadedEmailCapture(config);
        setIsLoadingEmailCapture(false);
        return config;
      })().catch((error) => {
        emailCaptureRequestRef.current = null;
        setIsLoadingEmailCapture(false);
        setEmailCaptureLoadError(
          "We couldn't load the next step. Please try again.",
        );
        captureException(error, {
          tags: { source: "fake-door-pricing-config" },
          extra: { sourcePage },
        });
        return null;
      });
    }
    return emailCaptureRequestRef.current;
  }

  // Initialize sessionId client-side only to avoid SSR/hydration mismatch
  useEffect(() => {
    setSessionId(generateSessionId());
  }, []);

  useFocusTrap(dialogRef, modalOpen);

  useEffect(() => {
    if (modalOpen) {
      closeBtnRef.current?.focus();
    }
  }, [modalOpen]);

  // Body scroll lock when modal is open
  useEffect(() => {
    if (!modalOpen) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (!hasEmailCaptureFlow || tiers.length === 0) return;
    document.documentElement.dataset.fakeDoorPricingReady = "true";
    document.dispatchEvent(new CustomEvent("fake-door-pricing-ready"));
    void loadEmailCaptureConfig();

    return () => {
      delete document.documentElement.dataset.fakeDoorPricingReady;
    };
  }, [hasEmailCaptureFlow, tiers]);

  async function handleTierSelection(tierName: string) {
    if (!selectedTiers.has(tierName)) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
    setSelectedTiers((prev) => new Set([...prev, tierName]));
    setLastSelectedTier(tierName);

    if (hasEmailCaptureFlow) {
      setModalOpen(true);
      void loadEmailCaptureConfig();
    }

    const tier = tiers.find((t) => t.name === tierName);
    const planSlug = tier?.slug ?? tierName.toLowerCase();
    const pricingClickUrl = `${apiUrl}/waitlist/pricing-click`;
    const pricingClickPayload = {
      tier: tierName.toLowerCase(),
      sourcePage,
      sessionId,
      billingPeriod,
    };
    const pricingClickPromise = sendPricingClick(
      pricingClickUrl,
      pricingClickPayload,
    ).catch((err) => {
      captureException(err, {
        tags: { source: "fake-door-pricing-submit" },
        extra: { sourcePage, tier: tierName, billingPeriod },
      });
    });

    if (appUrl && !hasEmailCaptureFlow) {
      void Promise.race([
        pricingClickPromise,
        new Promise((resolve) => window.setTimeout(resolve, 150)),
      ]).finally(() => {
        window.location.href = `${appUrl}/signup?plan=${planSlug}&cycle=${billingPeriod}`;
      });
    } else {
      void pricingClickPromise;
    }

    trackEvent("pricing_tier_selected", {
      tier_name: tierName,
      source_page: sourcePage,
      billing_period: billingPeriod,
    });

    onTierClick?.();
  }

  function resolveTierName(targetTierName?: string): string | undefined {
    if (!targetTierName) {
      return tiers[0]?.name;
    }

    return tiers.find(
      (tier) => tier.name.toLowerCase() === targetTierName.toLowerCase(),
    )?.name;
  }

  // Listen for external open-pricing-modal event (from sticky CTA)
  useEffect(() => {
    if (!hasEmailCaptureFlow || tiers.length === 0) return;
    function handleOpenModal(event: Event) {
      const customEvent = event as CustomEvent<{ tierName?: string }>;
      const tierName = resolveTierName(customEvent.detail?.tierName);
      if (!tierName) return;
      void handleTierSelection(tierName);
    }
    document.addEventListener("open-pricing-modal", handleOpenModal);
    return () =>
      document.removeEventListener("open-pricing-modal", handleOpenModal);
  }, [
    apiUrl,
    billingPeriod,
    hasEmailCaptureFlow,
    onTierClick,
    sessionId,
    sourcePage,
    tiers,
  ]);

  useEffect(() => {
    if (
      hasHandledUrlIntentRef.current ||
      !hasEmailCaptureFlow ||
      tiers.length === 0 ||
      sessionId.length === 0
    ) {
      return;
    }

    const tierName = findPricingIntentTierFromSearch(
      window.location.search,
      tiers,
    );
    if (!tierName) return;

    hasHandledUrlIntentRef.current = true;
    void handleTierSelection(tierName);
  }, [
    apiUrl,
    billingPeriod,
    hasEmailCaptureFlow,
    onTierClick,
    sessionId,
    sourcePage,
    tiers,
  ]);

  const hasSelection = selectedTiers.size > 0;
  const visibleTrialBannerText = sanitizePublicSignupMessage(trialBannerText);

  return (
    <>
      <section
        data-fake-door-pricing
        className="px-4 py-[var(--section-py)]"
        style={{ background: "var(--section-gradient-b)" }}
      >
        <div className="max-w-5xl mx-auto">
          {visibleTrialBannerText && (
            <p className="text-center mb-4 text-[length:var(--text-caption)] font-medium text-[var(--color-accent-600)]">
              {visibleTrialBannerText}
            </p>
          )}
          {promoAssurance && <PricingPromoAssurance {...promoAssurance} />}
          {heading && (
            <div className="flex items-baseline justify-between mb-10">
              <h2 className="text-[length:var(--text-heading)] font-bold font-heading">
                {heading}
              </h2>
              {hasSelection && (
                <button
                  onClick={clearSelection}
                  className="transition-colors text-[length:var(--text-caption)] underline text-[var(--color-neutral-500)] hover:text-[var(--color-brand-text)]"
                >
                  {clearButtonText}
                </button>
              )}
            </div>
          )}
          {!heading && hasSelection && (
            <div className="flex justify-end mb-4">
              <button
                onClick={clearSelection}
                className="transition-colors text-[length:var(--text-caption)] underline text-[var(--color-neutral-500)] hover:text-[var(--color-brand-text)]"
              >
                {clearButtonText}
              </button>
            </div>
          )}
          {canShowToggle && (
            <div
              role="radiogroup"
              aria-label="Billing period"
              className="flex justify-center mb-8"
            >
              <div className="flex w-full sm:w-auto sm:inline-flex rounded-full border border-[var(--color-neutral-300)] p-1 bg-[var(--surface-secondary)]">
                <button
                  role="radio"
                  aria-checked={billingPeriod === "monthly"}
                  onClick={() => {
                    setBillingPeriod("monthly");
                    trackBillingToggle("monthly", sourcePage);
                  }}
                  className={[
                    "flex-1 sm:flex-none justify-center inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "monthly"
                      ? "bg-[var(--color-accent-500)] text-[var(--color-accent-950)]"
                      : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
                  ].join(" ")}
                >
                  {monthlyToggleLabel ?? "Monthly"}
                </button>
                <button
                  role="radio"
                  aria-checked={billingPeriod === "annual"}
                  onClick={() => {
                    setBillingPeriod("annual");
                    trackBillingToggle("annual", sourcePage);
                  }}
                  className={[
                    "flex-1 sm:flex-none justify-center inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "annual"
                      ? "bg-[var(--color-accent-500)] text-[var(--color-accent-950)]"
                      : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
                  ].join(" ")}
                >
                  {annualToggleLabel ?? "Annual"}
                  {annualSavingsText && (
                    // aria-hidden keeps the radio button's accessible name as "Annual"
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center rounded-full bg-[var(--color-accent-100)] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[var(--color-accent-700)] leading-none"
                    >
                      {annualSavingsText}
                    </span>
                  )}
                </button>
                {hasLifetimeBilling && (
                  <button
                    role="radio"
                    aria-checked={billingPeriod === "lifetime"}
                    onClick={() => {
                      setBillingPeriod("lifetime");
                      trackBillingToggle("lifetime", sourcePage);
                    }}
                    className={[
                      "flex-1 sm:flex-none justify-center inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                      billingPeriod === "lifetime"
                        ? "bg-[var(--color-accent-500)] text-[var(--color-accent-950)]"
                        : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
                    ].join(" ")}
                  >
                    {lifetimeToggleLabel ?? "Lifetime"}
                  </button>
                )}
              </div>
            </div>
          )}
          {(() => {
            const categorySections = buildCategorySections(tiers);
            const hasStatutoryLayout = categorySections.length > 0;
            const gridTemplateColumns = `minmax(10rem, 1.1fr) repeat(${tiers.length}, minmax(0, 1fr))`;

            function renderPriceCell(tier: PricingTier) {
              const displayPrice =
                billingPeriod === "annual"
                  ? getAnnualPriceDisplay(tier)
                  : billingPeriod === "lifetime"
                    ? getLifetimePriceDisplay(tier)
                    : tier.price;
              return (
                <>
                  <span
                    className="block font-heading font-bold leading-none text-[var(--color-brand-text)]"
                    data-display-price="clamp(1.85rem, 2.6vw, 2.6rem)"
                    style={{ fontSize: "clamp(1.85rem, 2.6vw, 2.6rem)" }}
                  >
                    {displayPrice}
                  </span>
                  {billingPeriod === "annual" &&
                    (tier.annualPriceCents !== undefined ||
                      tier.monthlyPriceCents !== undefined) && (
                      <>
                        <span className="mt-1 block text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                          billed annually
                        </span>
                        <span className="block text-[length:var(--text-caption)] text-[var(--color-brand-muted)] line-through">
                          {tier.price}
                        </span>
                      </>
                    )}
                  {billingPeriod === "lifetime" &&
                    tier.lifetimePriceOverride !== undefined &&
                    tier.monthlyPriceCents !== undefined && (
                      <span className="block text-[length:var(--text-caption)] text-[var(--color-brand-muted)] line-through">
                        {tier.price}
                      </span>
                    )}
                </>
              );
            }

            function renderTierCtaButton(tier: PricingTier) {
              const isSelected = selectedTiers.has(tier.name);
              return (
                <button
                  onClick={() => void handleTierSelection(tier.name)}
                  className={[
                    "mt-6 w-full min-h-11 text-left",
                    "font-heading italic",
                    "border-t pt-4",
                    "underline-offset-4 hover:underline transition-colors",
                    isSelected
                      ? "bg-[var(--color-accent-100)] text-[var(--color-accent-700)] border-[var(--color-accent-400)] px-2"
                      : "text-[var(--color-accent-800)] hover:text-[var(--color-brand-primary)] border-[var(--color-neutral-200)]",
                  ].join(" ")}
                >
                  {isSelected ? (
                    <span className="flex items-center gap-2">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 7l3.5 3.5L12 3.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {selectedBadgeText}
                    </span>
                  ) : (
                    <>
                      {tier.ctaText
                        ? tier.ctaText
                        : buttonPrefix
                          ? `${buttonPrefix} ${tier.name}`
                          : tier.name}
                      <span aria-hidden="true"> →</span>
                    </>
                  )}
                </button>
              );
            }

            function renderTierHeader(tier: PricingTier) {
              const isSelected = selectedTiers.has(tier.name);
              const isPopular =
                popularTier !== undefined &&
                tier.name.toLowerCase() === popularTier.toLowerCase();
              const stripeClass = tier.highlighted
                ? "border-l-2 border-[var(--color-accent-400)] pl-5"
                : "pl-5";
              return (
                <div
                  className={[
                    "relative flex h-full flex-col pt-6",
                    stripeClass,
                  ].join(" ")}
                  data-tier-column
                  data-tier-name={tier.name}
                  data-tier-highlighted={tier.highlighted ? "true" : "false"}
                  data-tier-selected={isSelected ? "true" : "false"}
                >
                  {isPopular && !isSelected && (
                    <span className="u-kicker-serif mb-1 inline-block text-[var(--color-accent-700)]">
                      - {popularBadgeText}
                    </span>
                  )}
                  <div className="min-h-[3.25rem] mb-1 flex items-end">
                    {(tier.complianceScope ||
                      isSelected ||
                      (tier.highlighted && !isSelected)) && (
                      <p
                        className={[
                          "u-kicker-serif",
                          isSelected ? "text-[var(--color-accent-700)]" : "",
                        ].join(" ")}
                      >
                        {tier.complianceScope
                          ? `-- ${tier.complianceScope}`
                          : ""}
                        {isSelected
                          ? `${tier.complianceScope ? " ·" : "-- "}${selectedBadgeText}`
                          : tier.highlighted
                            ? `${tier.complianceScope ? " ·" : "-- "}${recommendedBadgeText}`
                            : ""}
                      </p>
                    )}
                  </div>
                  <h3
                    className="font-heading font-bold text-[var(--color-brand-text)]"
                    style={{ fontSize: "var(--text-subheading)" }}
                  >
                    {tier.name}
                  </h3>
                  <div className="mt-4">{renderPriceCell(tier)}</div>
                  {tier.description && (
                    <p className="mt-3 text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                      {tier.description}
                    </p>
                  )}
                  <div className="mt-auto pt-6">
                    {renderTierCtaButton(tier)}
                  </div>
                </div>
              );
            }

            function renderMobileTierCard(tier: PricingTier) {
              const isSelected = selectedTiers.has(tier.name);
              const isPopular =
                popularTier !== undefined &&
                tier.name.toLowerCase() === popularTier.toLowerCase();
              const displayFeatures =
                tier.statutoryFeatures?.map((feature) => feature.label) ??
                tier.features;

              return (
                <article
                  key={`mobile-${tier.name}`}
                  data-mobile-tier-card
                  className={[
                    "rounded-md border bg-[var(--surface-secondary)] p-5",
                    tier.highlighted
                      ? "border-[var(--color-accent-400)]"
                      : "border-[var(--color-neutral-200)]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {(isPopular || tier.highlighted || isSelected) && (
                        <p className="u-kicker-serif mb-2 text-[var(--color-accent-700)]">
                          {isSelected
                            ? selectedBadgeText
                            : isPopular
                              ? popularBadgeText
                              : recommendedBadgeText}
                        </p>
                      )}
                      <h3
                        className="font-heading font-bold text-[var(--color-brand-text)]"
                        style={{ fontSize: "var(--text-subheading)" }}
                      >
                        {tier.name}
                      </h3>
                    </div>
                    <div className="shrink-0 text-right">
                      {renderPriceCell(tier)}
                    </div>
                  </div>
                  {tier.description && (
                    <p className="mt-3 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
                      {tier.description}
                    </p>
                  )}
                  <ul className="mt-5 space-y-2">
                    {displayFeatures.map((feature) => (
                      <li
                        key={feature}
                        className="grid grid-cols-[auto_1fr] gap-2 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-text)]"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 text-[var(--color-accent-700)]"
                        >
                          ▸
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    aria-label={`${buttonPrefix ? `${buttonPrefix} ` : ""}${tier.name} mobile`}
                    onClick={() => void handleTierSelection(tier.name)}
                    className={[
                      "mt-5 flex min-h-11 w-full items-center justify-center rounded-full border px-4 py-2 text-center",
                      "font-heading italic transition-colors",
                      isSelected
                        ? "border-[var(--color-accent-400)] bg-[var(--color-accent-100)] text-[var(--color-accent-700)]"
                        : "border-[var(--color-accent-500)] text-[var(--color-accent-800)] hover:bg-[var(--color-accent-100)]",
                    ].join(" ")}
                  >
                    {isSelected
                      ? selectedBadgeText
                      : tier.ctaText
                        ? tier.ctaText
                        : buttonPrefix
                          ? `${buttonPrefix} ${tier.name}`
                          : tier.name}
                  </button>
                </article>
              );
            }

            // Single-tier layout keeps the centered column shell.
            if (tiers.length === 1) {
              const tier = tiers[0];
              return (
                <div className="mx-auto max-w-lg" data-pricing-layout="single">
                  {renderTierHeader(tier)}
                  {hasStatutoryLayout ? (
                    <div className="mt-8 space-y-8">
                      {categorySections.map((section) => (
                        <div key={section.category}>
                          <p className="u-kicker-serif mb-3">{section.label}</p>
                          <ul className="space-y-2">
                            {section.rows.map((row) => {
                              const feat = row.features[tier.name];
                              if (!feat) return null;
                              return (
                                <li key={row.key}>
                                  <p className="text-[length:var(--text-caption)] text-[var(--color-brand-text)]">
                                    <span
                                      aria-hidden="true"
                                      className="mr-2 text-[var(--color-accent-700)]"
                                    >
                                      ▸
                                    </span>
                                    {feat.label}
                                  </p>
                                  {feat.citation && (
                                    <p className="u-statute-citation ml-4 mt-0.5">
                                      {feat.citation}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="mt-6 space-y-2">
                      {tier.features.map((f) => (
                        <li
                          key={f}
                          className="text-[length:var(--text-caption)] text-[var(--color-brand-text)]"
                        >
                          <span
                            aria-hidden="true"
                            className="mr-2 text-[var(--color-accent-700)]"
                          >
                            ▸
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            return (
              <>
                <div
                  data-pricing-layout="mobile-stacked"
                  className="space-y-4 md:hidden"
                >
                  {tiers.map((tier) => renderMobileTierCard(tier))}
                </div>
                <div
                  data-pricing-layout="comparison"
                  className="hidden overflow-x-auto md:block"
                >
                  <div
                    className="grid min-w-[48rem] gap-x-6"
                    style={{ gridTemplateColumns }}
                    role="table"
                    aria-label="Pricing comparison"
                  >
                    {/* Header row: empty cell + tier headers */}
                    <div role="rowheader" aria-hidden="true" />
                    {tiers.map((tier) => (
                      <div role="columnheader" key={`head-${tier.name}`}>
                        {renderTierHeader(tier)}
                      </div>
                    ))}

                    {hasStatutoryLayout ? (
                      categorySections.map((section) => (
                        <div
                          key={section.category}
                          role="rowgroup"
                          className="contents"
                        >
                          {/* Category label row */}
                          <div
                            className="col-span-full mt-10 border-t border-[var(--color-neutral-200)] pt-4"
                            data-category-label={section.category}
                          >
                            <p className="u-kicker-serif">{section.label}</p>
                          </div>
                          {section.rows.map((row) => (
                            <div key={row.key} role="row" className="contents">
                              <div role="rowheader" aria-hidden="true" />
                              {tiers.map((tier) => {
                                const feat = row.features[tier.name];
                                const highlightClass = tier.highlighted
                                  ? "border-l-2 border-[var(--color-accent-400)] pl-5"
                                  : "pl-5";
                                return (
                                  <div
                                    key={`${row.key}-${tier.name}`}
                                    role="cell"
                                    className={[
                                      "py-3 text-[length:var(--text-caption)] text-[var(--color-brand-text)]",
                                      highlightClass,
                                    ].join(" ")}
                                  >
                                    {feat ? (
                                      <>
                                        <p>
                                          <span
                                            aria-hidden="true"
                                            className="mr-2 text-[var(--color-accent-700)]"
                                          >
                                            ▸
                                          </span>
                                          {feat.label}
                                        </p>
                                        {feat.citation && (
                                          <p className="u-statute-citation ml-4 mt-1">
                                            {feat.citation}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <span
                                        aria-hidden="true"
                                        className="text-[var(--color-neutral-400)]"
                                      >
                                        --
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <div role="rowgroup" className="contents">
                        <div className="col-span-full mt-8 border-t border-[var(--color-neutral-200)] pt-4">
                          <p className="u-kicker-serif">What's included</p>
                        </div>
                        {(() => {
                          const maxFeatureCount = Math.max(
                            ...tiers.map((t) => t.features.length),
                          );
                          const rows: ReactElement[] = [];
                          for (let i = 0; i < maxFeatureCount; i += 1) {
                            rows.push(
                              <div
                                key={`feat-row-${i}`}
                                role="row"
                                className="contents"
                              >
                                <div role="rowheader" aria-hidden="true" />
                                {tiers.map((tier) => {
                                  const label = tier.features[i];
                                  const highlightClass = tier.highlighted
                                    ? "border-l-2 border-[var(--color-accent-400)] pl-5"
                                    : "pl-5";
                                  return (
                                    <div
                                      key={`feat-${i}-${tier.name}`}
                                      role="cell"
                                      className={[
                                        "py-3 text-[length:var(--text-caption)] text-[var(--color-brand-text)]",
                                        highlightClass,
                                      ].join(" ")}
                                    >
                                      {label ? (
                                        <p>
                                          <span
                                            aria-hidden="true"
                                            className="mr-2 text-[var(--color-accent-700)]"
                                          >
                                            ▸
                                          </span>
                                          {label}
                                        </p>
                                      ) : (
                                        <span
                                          aria-hidden="true"
                                          className="text-[var(--color-neutral-400)]"
                                        >
                                          --
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>,
                            );
                          }
                          return rows;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
          {socialProofText && (
            <p className="mx-auto mt-5 max-w-2xl text-center text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
              {socialProofText}
            </p>
          )}
          {hasSelection &&
            !resolvedEmailCapture &&
            (() => {
              const tierKey = lastSelectedTier?.toLowerCase() ?? "";
              const normalizedMessages = selectedMessages
                ? Object.fromEntries(
                    Object.entries(selectedMessages).map(([k, v]) => [
                      k.toLowerCase(),
                      v,
                    ]),
                  )
                : undefined;
              const message =
                tierKey && normalizedMessages?.[tierKey]
                  ? normalizedMessages[tierKey]
                  : confirmationMessage;
              return message ? (
                <p className="text-center mt-6 text-[var(--color-brand-muted)]">
                  {message}
                </p>
              ) : null;
            })()}
        </div>
      </section>

      {/* Email capture modal mounts outside the section so it overlays everything */}
      {modalOpen && hasEmailCaptureFlow && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: "var(--surface-overlay)" }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={modalAriaLabel}
        >
          <div
            className="relative w-full rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] sm:max-w-lg sm:mx-4 shadow-[var(--shadow-ambient)] overflow-hidden"
            style={{
              background: "var(--surface-elevated)",
              paddingBottom: "var(--safe-bottom)",
            }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={closeModal}
              className="absolute top-3 right-3 z-10 min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-[var(--color-neutral-500)] hover:bg-[var(--surface-secondary)] transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div className="p-6 pt-8">
              {resolvedEmailCapture ? (
                <EmailCapture
                  apiUrl={resolvedEmailCapture.apiUrl ?? apiUrl}
                  sourcePage={resolvedEmailCapture.sourcePage ?? sourcePage}
                  surveyQuestions={resolvedEmailCapture.surveyQuestions}
                  surveyQualification={resolvedQualification}
                  qualification={resolvedQualification}
                  discoveryCallUrl={resolvedEmailCapture.discoveryCallUrl}
                  signupFlowConfigUrl={undefined}
                  privacyNote={resolvedEmailCapture.privacyNote}
                  errorInvalidEmail={resolvedEmailCapture.errorInvalidEmail}
                  errorDuplicate={resolvedEmailCapture.errorDuplicate}
                  errorGeneric={resolvedEmailCapture.errorGeneric}
                  successMessage={resolvedEmailCapture.successMessage}
                  surveyPreview={resolvedEmailCapture.surveyPreview}
                  whatHappensNext={resolvedEmailCapture.whatHappensNext}
                  referralRewards={resolvedEmailCapture.referralRewards}
                  productName={resolvedEmailCapture.productName}
                  productDomain={resolvedEmailCapture.productDomain}
                  qualifiedHeading={resolvedEmailCapture.qualifiedHeading}
                  qualifiedBody={resolvedEmailCapture.qualifiedBody}
                  qualifiedCtaText={resolvedEmailCapture.qualifiedCtaText}
                  qualifiedDismissText={
                    resolvedEmailCapture.qualifiedDismissText
                  }
                  unqualifiedHeading={resolvedEmailCapture.unqualifiedHeading}
                  unqualifiedBody={resolvedEmailCapture.unqualifiedBody}
                  unqualifiedCtaText={resolvedEmailCapture.unqualifiedCtaText}
                  unqualifiedCtaTarget={
                    resolvedEmailCapture.unqualifiedCtaTarget
                  }
                  unqualifiedDismissText={
                    resolvedEmailCapture.unqualifiedDismissText
                  }
                  buttonText={resolvedEmailCapture.buttonText ?? "Continue"}
                  placeholder={resolvedEmailCapture.placeholder}
                  subtitle={
                    resolvedEmailCapture.subtitle ??
                    (resolvedEmailCapture.productName
                      ? `You picked a plan. Enter your email to continue with ${resolvedEmailCapture.productName}.`
                      : "You picked a plan. Enter your email to continue.")
                  }
                  ariaLabel={resolvedEmailCapture.ariaLabel ?? modalAriaLabel}
                />
              ) : emailCaptureLoadError ? (
                <div className="space-y-4 text-center">
                  <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
                    We couldn't load the signup form.
                  </h3>
                  <p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
                    {emailCaptureLoadError}
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void loadEmailCaptureConfig()}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
                    Loading next step…
                  </h3>
                  <p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
                    We&apos;re preparing the signup form for your selected plan.
                  </p>
                  {isLoadingEmailCapture ? (
                    <div
                      className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-accent-500)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
