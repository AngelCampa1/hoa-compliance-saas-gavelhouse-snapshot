import { describe, expect, it } from "vitest";
import { knowledgeBase } from "@boardstack/shared";

import {
  DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
  DEFAULT_PUBLIC_SIGNUP_MESSAGE,
  resolvePublicSignupCta,
  sanitizePublicSignupCtaText,
  sanitizePublicSignupMessage,
} from "./public-signup-cta";

const publicSignupUrl = knowledgeBase.marketing.funnel.publicSignupUrl;

describe("resolvePublicSignupCta", () => {
  it("uses the signup app for homepage inline CTAs", () => {
    expect(resolvePublicSignupCta({ sourcePage:"/" })).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: publicSignupUrl,
    });
  });

  it("uses the signup app for non-home pages by default", () => {
    expect(
      resolvePublicSignupCta({ sourcePage:"/resources/guides/example" }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: publicSignupUrl,
    });
  });

  it("preserves an explicit fake-door target when provided", () => {
    expect(
      resolvePublicSignupCta({
        sourcePage:"/resources/guides/example",
        explicitTarget:"/?plan=center#pricing",
        explicitText: "See Gavelhouse pricing",
      }),
    ).toEqual({
      text: "See Gavelhouse pricing",
      target:"/?plan=center#pricing",
    });
  });

  it("preserves free-trial CTA copy for the production trial flow", () => {
    expect(
      resolvePublicSignupCta({
        sourcePage:"/resources/guides/example",
        explicitText: "Start Your Free Trial",
      }),
    ).toEqual({
      text: "Start Your Free Trial",
      target: publicSignupUrl,
    });
  });
});

describe("sanitizePublicSignupCtaText", () => {
  it("replaces waitlist CTA copy with neutral pricing copy", () => {
    expect(sanitizePublicSignupCtaText("Join the waitlist")).toBe(
      DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
    );
  });

  it("preserves safe CTA copy", () => {
    expect(sanitizePublicSignupCtaText("See pricing")).toBe("See pricing");
  });
});

describe("sanitizePublicSignupMessage", () => {
  it("preserves free-trial message copy for the production trial flow", () => {
    expect(
      sanitizePublicSignupMessage("30-day free trial - billing details later"),
    ).toBe("30-day free trial - billing details later");
  });

  it("replaces follow-up message copy with canonical signup copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Quick follow-up, then a free trial with no gated sales call",
      ),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("preserves signup-oriented helper copy for the production trial flow", () => {
    expect(
      sanitizePublicSignupMessage(
        "Mutra is built for the admin paralysis no timer or tracker can fix. Sign up free.",
      ),
    ).toBe(
      "Mutra is built for the admin paralysis no timer or tracker can fix. Sign up free.",
    );
  });

  it("preserves safe helper copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Pick a plan to see pricing details and next steps.",
      ),
    ).toBe("Pick a plan to see pricing details and next steps.");
  });
});
