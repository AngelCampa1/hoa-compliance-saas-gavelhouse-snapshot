import type { BuyerStage, CtaAnalyticsContext } from "./types";
import { PUBLIC_WEB_URL } from "@boardstack/shared";

export type CtaClickEventProperties = Record<string, unknown> & {
  button_text: string;
  href: string;
  section: string;
  page_path: string;
  page_family?: string;
  buyer_stage?: BuyerStage;
  placement?: string;
  intent?: string;
  target?: string;
};

interface CtaClickEventPropertyInput {
  buttonText: string;
  href: string;
  section: string;
  pagePath: string;
}

const CTA_ANALYTICS_ATTRIBUTE_MAP = {
  pageFamily: "data-cta-page-family",
  buyerStage: "data-cta-buyer-stage",
  placement: "data-cta-placement",
  intent: "data-cta-intent",
  target: "data-cta-target",
} as const;

type CtaAnalyticsAttributeKey = keyof typeof CTA_ANALYTICS_ATTRIBUTE_MAP;

export function buildCtaAnalyticsAttributes(
  context?: CtaAnalyticsContext,
): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-cta-button": "",
  };

  if (!context) {
    return attributes;
  }

  for (const [key, attributeName] of Object.entries(
    CTA_ANALYTICS_ATTRIBUTE_MAP,
  ) as Array<[CtaAnalyticsAttributeKey, string]>) {
    const value = context[key];
    if (value) {
      attributes[attributeName] =
        key === "target" ? sanitizeCtaTarget(value) : value;
    }
  }

  return attributes;
}

function readCtaAnalyticsAttribute(
  element: HTMLElement,
  attributeName: string,
): string | undefined {
  const ownValue = element.getAttribute(attributeName);
  if (ownValue) {
    return ownValue;
  }

  const parentWithValue = element.closest(`[${attributeName}]`);
  const inheritedValue = parentWithValue?.getAttribute(attributeName);
  return inheritedValue || undefined;
}

export function getCtaAnalyticsContext(
  element: HTMLElement,
): CtaAnalyticsContext {
  return {
    pageFamily: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.pageFamily,
    ),
    buyerStage: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.buyerStage,
    ) as BuyerStage | undefined,
    placement: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.placement,
    ),
    intent: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.intent,
    ),
    target: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.target,
    ),
  };
}

export function sanitizeCtaTarget(target: string): string {
  if (!target) return "";
  if (target.startsWith("#")) {
    return /^#[A-Za-z][A-Za-z0-9_-]*$/.test(target) ? target : "";
  }

  try {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) {
      const parsedAbsolute = new URL(target);
      if (
        parsedAbsolute.protocol !== "http:" &&
        parsedAbsolute.protocol !== "https:"
      ) {
        return "";
      }
      return `${parsedAbsolute.origin}${parsedAbsolute.pathname}`;
    }

    const origin =
      typeof window === "undefined" ? PUBLIC_WEB_URL : window.location.origin;
    const parsed = new URL(target, origin);
    if (parsed.origin === origin) {
      return parsed.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return target.split(/[?#]/, 1)[0];
  }
}

export function buildCtaClickEventProperties(
  element: HTMLElement,
  input: CtaClickEventPropertyInput,
): CtaClickEventProperties {
  const context = getCtaAnalyticsContext(element);

  return {
    button_text: input.buttonText,
    href: sanitizeCtaTarget(input.href),
    section: input.section,
    page_path: input.pagePath,
    ...(context.pageFamily ? { page_family: context.pageFamily } : {}),
    ...(context.buyerStage ? { buyer_stage: context.buyerStage } : {}),
    ...(context.placement ? { placement: context.placement } : {}),
    ...(context.intent ? { intent: context.intent } : {}),
    ...(context.target ? { target: sanitizeCtaTarget(context.target) } : {}),
  };
}
