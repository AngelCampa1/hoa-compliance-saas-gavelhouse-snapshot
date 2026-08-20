import { knowledgeBase } from "@boardstack/shared";

export const DEFAULT_PUBLIC_SIGNUP_CTA_TEXT = "Start trial";
export const DEFAULT_PUBLIC_SIGNUP_MESSAGE = `Try Scale features first. Pick a plan later. Keep the ${knowledgeBase.marketing.offer.guaranteeLabel}.`;
const DISALLOWED_PUBLIC_CTA_TEXT_PATTERN =
  /\b(waitlist|launch access|questionnaire|survey|follow-?up)\b/i;
const DISALLOWED_PUBLIC_MESSAGE_PATTERN =
  /\b(waitlist|launch access|questionnaire|survey|follow-?up|free trial included)\b/i;

interface ResolvePublicSignupCtaOptions {
  sourcePage: string;
  explicitTarget?: string;
  explicitText?: string;
}

export interface PublicSignupCta {
  text: string;
  target: string;
}

export function sanitizePublicSignupCtaText(text?: string): string {
  if (!text) {
    return DEFAULT_PUBLIC_SIGNUP_CTA_TEXT;
  }

  return DISALLOWED_PUBLIC_CTA_TEXT_PATTERN.test(text)
    ? DEFAULT_PUBLIC_SIGNUP_CTA_TEXT
    : text;
}

export function sanitizePublicSignupMessage(
  text: string | undefined,
  fallback = DEFAULT_PUBLIC_SIGNUP_MESSAGE,
): string | undefined {
  if (!text) {
    return text;
  }

  return DISALLOWED_PUBLIC_MESSAGE_PATTERN.test(text) ? fallback : text;
}

export function resolvePublicSignupCta({
  explicitTarget,
  explicitText,
}: ResolvePublicSignupCtaOptions): PublicSignupCta {
  const target =
    explicitTarget ?? knowledgeBase.marketing.funnel.publicSignupUrl;

  return {
    text: sanitizePublicSignupCtaText(explicitText),
    target,
  };
}
