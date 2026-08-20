import { describe, it, expect } from "vitest";
import { buildFooterEmailCaptureProps } from "./footer-utils";
import type { SiteConfig } from "./types";

/** Minimal SiteConfig stub with only the fields buildFooterEmailCaptureProps reads. */
function makeConfig(
  overrides: Partial<{
    name: string;
    domain: string;
    footer: SiteConfig["footer"];
    funnel: SiteConfig["funnel"];
    survey: SiteConfig["survey"];
    referral: SiteConfig["referral"];
    discoveryCallUrl: string;
    copy: SiteConfig["copy"];
  }> = {},
): SiteConfig {
  return {
    name: overrides.name ?? "Test Site",
    domain: overrides.domain ?? "testsite.com",
    footer: overrides.footer,
    funnel: overrides.funnel ?? {
      tofu: {
        ctaMode: "educate",
        ctaText: "Read the guide",
        ctaTarget: "/resources",
      },
      mofu: {
        ctaMode: "evaluate",
        ctaText: "Compare options",
        ctaTarget: "/compare",
      },
      bofu: {
        ctaMode: "convert",
        ctaText: "Start Free Trial",
        ctaTarget: "/#pricing",
      },
      ctaSubtitle: "Proof-driven CTA subtitle",
    },
    survey: overrides.survey ?? {
      questions: [
        {
          id: "role",
          text: "What is your role?",
          options: ["Owner", "Manager"],
        },
      ],
    },
    referral: overrides.referral ?? {
      enabled: true,
      rewards: [{ threshold: 3, description: "Extra trial time" }],
    },
    discoveryCallUrl: overrides.discoveryCallUrl ?? "https://cal.com/test",
    copy: overrides.copy,
  } as SiteConfig;
}

describe("buildFooterEmailCaptureProps", () => {
  it("returns undefined when footer.emailCapture is not set", () => {
    const config = makeConfig({ footer: undefined });
    expect(
      buildFooterEmailCaptureProps(config, "https://example.com"),
    ).toBeUndefined();
  });

  it("returns undefined when footer exists but emailCapture is undefined", () => {
    const config = makeConfig({
      footer: {
        linkGroups: [],
        legalLinks: [],
      } as unknown as SiteConfig["footer"],
    });
    expect(
      buildFooterEmailCaptureProps(config, "https://example.com"),
    ).toBeUndefined();
  });

  it("returns CTA props sourced from the BOFU funnel target when footer.emailCapture is set", () => {
    const config = makeConfig({
      footer: {
        emailCapture: {
          heading: "Stay Updated",
          buttonText: "Subscribe",
        },
        linkGroups: [],
        legalLinks: [],
      },
      survey: {
        questions: [
          { id: "role", text: "Role?", options: ["Dev", "PM"] },
          { id: "pain", text: "Pain?", options: ["Speed", "Cost"] },
        ],
        qualification: {
          logic: "all",
          rules: [{ questionId: "role", answers: ["Dev"] }],
        },
      },
      discoveryCallUrl: "https://cal.com/demo",
      referral: {
        enabled: true,
        rewards: [{ threshold: 5, description: "Extra onboarding help" }],
      },
      funnel: {
        tofu: {
          ctaMode: "educate",
          ctaText: "Read the guide",
          ctaTarget: "/resources",
        },
        mofu: {
          ctaMode: "evaluate",
          ctaText: "Compare options",
          ctaTarget: "/compare",
        },
        bofu: {
          ctaMode: "convert",
          ctaText: "View limited-offer pricing",
          ctaTarget: "/?plan=center#pricing",
        },
        ctaSubtitle: "Proof-driven CTA subtitle",
      },
      copy: {
        emailCapture: {
          privacyNote: "We respect your privacy.",
          errorInvalidEmail: "Invalid email format.",
          errorDuplicate: "Already signed up.",
          errorGeneric: "Something went wrong.",
          successMessage: "Welcome aboard!",
          surveyPreview: "Quick 3-question survey next.",
          subtitle: "Join 100+ contractors",
          whatHappensNext: "Check your inbox.",
        },
        survey: {
          qualifiedHeading: "You're a fit",
          qualifiedBody: "Book a call.",
          qualifiedCtaText: "Book now",
          qualifiedDismissText: "Maybe later",
          unqualifiedHeading: "Browse more",
          unqualifiedBody: "Explore our guides.",
          unqualifiedCtaText: "Open resources",
          unqualifiedCtaTarget: "/resources",
          unqualifiedDismissText: "Close",
        },
      },
    });

    const result = buildFooterEmailCaptureProps(config, "https://mysite.com");

    expect(result).toEqual({
      mode: "cta",
      heading: "Stay Updated",
      ctaText: "View limited-offer pricing",
      ctaTarget: "/?plan=center#pricing",
    });
  });

  it("returns CTA props without leaking email-capture copy when copy.emailCapture is set", () => {
    const config = makeConfig({
      footer: {
        emailCapture: {
          heading: "Join",
          buttonText: "Go",
        },
        linkGroups: [],
        legalLinks: [],
      },
      copy: {
        emailCapture: {
          subtitle: "Join the waitlist",
          surveyPreview: "3 quick survey questions next",
          whatHappensNext: "Check your inbox.",
          privacyNote: "We respect your privacy.",
        },
      },
    });

    const result = buildFooterEmailCaptureProps(config, "https://origin.com");

    expect(result).toBeDefined();
    expect(result!.mode).toBe("cta");
    expect(result!.heading).toBe("Join");
    if (!result || result.mode !== "cta") {
      throw new Error("Expected CTA footer props");
    }
    expect(result.ctaText).toBe("Start Free Trial");
    expect(result.ctaTarget).toBe("/#pricing");
    expect(result).not.toHaveProperty("subtitle");
    expect(result).not.toHaveProperty("surveyPreview");
    expect(result).not.toHaveProperty("whatHappensNext");
    expect(result).not.toHaveProperty("privacyNote");
  });

  it("uses the configured BOFU CTA when a site targets a non-default fake-door destination", () => {
    const config = makeConfig({
      footer: {
        emailCapture: { heading: "H", buttonText: "B" },
        linkGroups: [],
        legalLinks: [],
      },
      funnel: {
        tofu: {
          ctaMode: "educate",
          ctaText: "Read the guide",
          ctaTarget: "/resources",
        },
        mofu: {
          ctaMode: "evaluate",
          ctaText: "Compare options",
          ctaTarget: "/compare",
        },
        bofu: {
          ctaMode: "convert",
          ctaText: "See accessibility pricing",
          ctaTarget: "/#signup",
        },
        ctaSubtitle: "Proof-driven CTA subtitle",
      },
    });

    const result = buildFooterEmailCaptureProps(config, "https://site.com");
    if (!result || result.mode !== "cta") {
      throw new Error("Expected CTA footer props");
    }
    expect(result.ctaText).toBe("See accessibility pricing");
    expect(result.ctaTarget).toBe("/#signup");
  });
});
