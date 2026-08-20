import { describe, expect, it } from "vitest";

import type { SiteConfig } from "./types";
import { buildPublicSignupFlowConfig } from "./public-signup-flow";

const siteConfig = {
  name: "Floriva",
  domain: "floriva.app",
  tagline: "Private period tracking",
  theme: {
    primary: "#000000",
    accent: "#111111",
    fonts: {
      heading: "Test Heading",
      body: "Test Body",
    },
  },
  product: {
    category: "Health",
    price: "$5/mo",
    targetAudience: "People",
    trustSignals: [],
  },
  competitors: [],
  funnel: {
    tofu: { ctaMode: "educate", ctaText: "Learn", ctaTarget:"/guides" },
    mofu: { ctaMode: "evaluate", ctaText: "Compare", ctaTarget:"/compare" },
    bofu: { ctaMode: "convert", ctaText: "Start", ctaTarget:"/signup" },
    ctaSubtitle: "Private by default",
  },
  survey: {
    questions: [{ id: "role", text: "Role?", options: ["User"] }],
    qualification: {
      logic: "all",
      rules: [{ questionId: "role", answers: ["User"] }],
    },
  },
  faqs: [],
  discoveryCallUrl: "https://cal.test/floriva",
  discoveryCallIncentive: "Free consult",
  problemAgitation: {
    heading: "Problem",
    closingLine: "Solution",
    painPoints: [],
  },
  referral: {
    enabled: true,
    rewards: [{ threshold: 3, description: "3 referrals" }],
  },
  copy: {
    emailCapture: {
      subtitle: "Stored on your device.",
      whatHappensNext: "We'll send your access link.",
      surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
      privacyNote: "Private by default.",
      errorInvalidEmail: "Bad email",
      errorDuplicate: "Already on the list",
      errorGeneric: "Try again",
      successMessage: "You're in",
    },
    survey: {
      qualifiedHeading: "Qualified",
      qualifiedBody: "Book time",
      qualifiedCtaText: "Book now",
      qualifiedDismissText: "Later",
      unqualifiedHeading: "Not qualified",
      unqualifiedBody: "Read guide",
      unqualifiedCtaText: "Read more",
      unqualifiedCtaTarget:"/guide",
      unqualifiedDismissText: "Close",
    },
  },
} satisfies SiteConfig;

describe("buildPublicSignupFlowConfig", () => {
  it("returns only reusable public signup-flow fields", () => {
    expect(buildPublicSignupFlowConfig(siteConfig)).toEqual({
      surveyQuestions: siteConfig.survey.questions,
      surveyQualification: siteConfig.survey.qualification,
      qualification: siteConfig.survey.qualification,
      discoveryCallUrl: siteConfig.discoveryCallUrl,
      subtitle: siteConfig.copy?.emailCapture?.subtitle,
      whatHappensNext: siteConfig.copy?.emailCapture?.whatHappensNext,
      surveyPreview: siteConfig.copy?.emailCapture?.surveyPreview,
      privacyNote: siteConfig.copy?.emailCapture?.privacyNote,
      errorInvalidEmail: siteConfig.copy?.emailCapture?.errorInvalidEmail,
      errorDuplicate: siteConfig.copy?.emailCapture?.errorDuplicate,
      errorGeneric: siteConfig.copy?.emailCapture?.errorGeneric,
      successMessage: siteConfig.copy?.emailCapture?.successMessage,
      referralRewards: siteConfig.referral.rewards,
      productName: siteConfig.name,
      productDomain: siteConfig.domain,
      qualifiedHeading: siteConfig.copy?.survey?.qualifiedHeading,
      qualifiedBody: siteConfig.copy?.survey?.qualifiedBody,
      qualifiedCtaText: siteConfig.copy?.survey?.qualifiedCtaText,
      qualifiedDismissText: siteConfig.copy?.survey?.qualifiedDismissText,
      unqualifiedHeading: siteConfig.copy?.survey?.unqualifiedHeading,
      unqualifiedBody: siteConfig.copy?.survey?.unqualifiedBody,
      unqualifiedCtaText: siteConfig.copy?.survey?.unqualifiedCtaText,
      unqualifiedCtaTarget: siteConfig.copy?.survey?.unqualifiedCtaTarget,
      unqualifiedDismissText: siteConfig.copy?.survey?.unqualifiedDismissText,
    });
  });

  it("falls back to default values when emailCapture copy is omitted", () => {
    const minimalConfig = {
      ...siteConfig,
      copy: undefined,
    } satisfies SiteConfig;
    const result = buildPublicSignupFlowConfig(minimalConfig);
    expect(result.whatHappensNext).toBe("We'll send your access link.");
    expect(result.surveyPreview).toBe(
      "Quick 3-question survey. Takes 30 seconds.",
    );
  });

  it("does not include request-specific fields like apiUrl or sourcePage", () => {
    expect(buildPublicSignupFlowConfig(siteConfig)).not.toHaveProperty(
      "apiUrl",
    );
    expect(buildPublicSignupFlowConfig(siteConfig)).not.toHaveProperty(
      "sourcePage",
    );
  });
});
