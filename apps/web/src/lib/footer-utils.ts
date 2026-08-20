import type { SiteConfig } from "./types";
import { resolvePublicSignupCta } from "./public-signup-cta";

export interface FooterEmailCaptureCtaProps {
  mode: "cta";
  heading?: string;
  ctaText: string;
  ctaTarget: string;
}

export interface FooterEmailCaptureFormProps {
  mode?: "capture";
  heading?: string;
  buttonText?: string;
  apiUrl: string;
  sourcePage: string;
  surveyQuestions: SiteConfig["survey"]["questions"];
  surveyQualification?: SiteConfig["survey"]["qualification"];
  qualification?: SiteConfig["survey"]["qualification"];
  discoveryCallUrl: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  surveyPreview?: string;
  subtitle?: string;
  whatHappensNext?: string;
  referralRewards?: SiteConfig["referral"]["rewards"];
  productName?: string;
  productDomain?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  qualifiedDismissText?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  unqualifiedDismissText?: string;
}

export type FooterEmailCaptureProps =
  | FooterEmailCaptureCtaProps
  | FooterEmailCaptureFormProps;

export function buildFooterEmailCaptureProps(
  config: SiteConfig,
  _origin: string,
): FooterEmailCaptureProps | undefined {
  if (!config.footer?.emailCapture) return undefined;

  const cta = resolvePublicSignupCta({
    sourcePage: "footer",
    explicitTarget: config.funnel.bofu.ctaTarget,
    explicitText: config.funnel.bofu.ctaText,
  });

  return {
    mode: "cta",
    heading: config.footer.emailCapture.heading,
    ctaText: cta.text,
    ctaTarget: cta.target,
  };
}
