import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  LEAD_MAGNET_SLUGS,
  LeadMagnetSlugSchema,
  SubscribeRequestSchema,
  SubscribeResponseSchema,
  WaitlistSubscribeRequestSchema,
  WaitlistSurveyRequestSchema,
} from "../../src/schemas/leadMagnet.js";

describe("LEAD_MAGNET_SLUGS", () => {
  it("contains every promoted lead magnet slug", () => {
    expect(LEAD_MAGNET_SLUGS).toEqual([
      "reserve-fund-calculator",
      "hoa-annual-meeting-planner",
      "hoa-software-evaluation-scorecard",
      "hoa-board-transition-checklist",
      "hoa-budget-template",
      "reserve-compliance-checklist",
      "50-state-reserve-fund-requirements",
      "hoa-board-meeting-agenda-template",
      "reserve-study-rfp-template",
      "hoa-fiduciary-duty-checklist",
      "hoa-collections-policy-template",
      "hoa-cybersecurity-checklist",
      "hoa-newsletter-template",
      "hoa-budget-checklist",
      "hoa-board-onboarding-kit",
      "hoa-reserve-fund-calculator",
      "hoa-ccr-enforcement-checklist",
    ]);
    expect(LEAD_MAGNET_SLUGS).toHaveLength(17);
  });
});

describe("LeadMagnetSlugSchema", () => {
  it("accepts every valid slug", () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      expect(LeadMagnetSlugSchema.parse(slug)).toBe(slug);
    }
  });

  it("rejects an unknown slug", () => {
    expect(() => LeadMagnetSlugSchema.parse("unknown-slug")).toThrow(ZodError);
  });
});

describe("SubscribeRequestSchema", () => {
  it("parses a minimal valid request and lowercases the email", () => {
    const result = SubscribeRequestSchema.parse({
      email: "Board@Example.COM",
      magnetSlug: "reserve-fund-calculator",
    });
    expect(result.email).toBe("board@example.com");
    expect(result.magnetSlug).toBe("reserve-fund-calculator");
    expect(result.sourcePage).toBeUndefined();
    expect(result.posthogDistinctId).toBeUndefined();
  });

  it("parses a request with optional fields", () => {
    const result = SubscribeRequestSchema.parse({
      email: "board@example.com",
      magnetSlug: "hoa-budget-template",
      sourcePage: "https://gavelhouse.app/resources/hoa-budget-template",
      posthogDistinctId: "ph-distinct-id",
      companyWebsite: "",
      turnstileToken: "cf-turnstile-token",
    });
    expect(result.sourcePage).toBe(
      "https://gavelhouse.app/resources/hoa-budget-template",
    );
    expect(result.posthogDistinctId).toBe("ph-distinct-id");
    expect(result.companyWebsite).toBe("");
    expect(result.turnstileToken).toBe("cf-turnstile-token");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        email: "not-an-email",
        magnetSlug: "reserve-fund-calculator",
      }),
    ).toThrow(ZodError);
  });

  it("rejects an invalid magnetSlug", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        email: "board@example.com",
        magnetSlug: "bogus-slug",
      }),
    ).toThrow(ZodError);
  });

  it("accepts a short slug/path style sourcePage (legacy callers)", () => {
    const result = SubscribeRequestSchema.parse({
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "/guides/privacy",
    });
    expect(result.sourcePage).toBe("/guides/privacy");
  });

  it("accepts a bare identifier style sourcePage (exit-intent popup)", () => {
    const result = SubscribeRequestSchema.parse({
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "exit-intent",
    });
    expect(result.sourcePage).toBe("exit-intent");
  });

  it("rejects a sourcePage over 512 characters", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        sourcePage: "x".repeat(513),
      }),
    ).toThrow(ZodError);
  });

  it("bounds the public form honeypot and Turnstile token fields", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        companyWebsite: "x".repeat(257),
      }),
    ).toThrow(ZodError);

    expect(() =>
      SubscribeRequestSchema.parse({
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        turnstileToken: "x".repeat(2049),
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing email", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        magnetSlug: "reserve-fund-calculator",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing magnetSlug", () => {
    expect(() =>
      SubscribeRequestSchema.parse({
        email: "board@example.com",
      }),
    ).toThrow(ZodError);
  });
});

describe("WaitlistSubscribeRequestSchema", () => {
  it("accepts bounded honeypot and Turnstile token fields", () => {
    const result = WaitlistSubscribeRequestSchema.parse({
      email: "Board@Example.COM",
      sourcePage: "/pricing/",
      companyWebsite: "",
      turnstileToken: "cf-turnstile-token",
    });

    expect(result.email).toBe("board@example.com");
    expect(result.companyWebsite).toBe("");
    expect(result.turnstileToken).toBe("cf-turnstile-token");
  });

  it("rejects oversized honeypot and Turnstile token fields", () => {
    expect(() =>
      WaitlistSubscribeRequestSchema.parse({
        email: "board@example.com",
        companyWebsite: "x".repeat(257),
      }),
    ).toThrow(ZodError);

    expect(() =>
      WaitlistSubscribeRequestSchema.parse({
        email: "board@example.com",
        turnstileToken: "x".repeat(2049),
      }),
    ).toThrow(ZodError);
  });
});

describe("SubscribeResponseSchema", () => {
  it("parses a valid response", () => {
    const result = SubscribeResponseSchema.parse({
      downloadUrl: "https://gavelhouse.app/downloads/hoa-budget-template.pdf",
      alreadySubscribed: false,
    });
    expect(result.downloadUrl).toBe(
      "https://gavelhouse.app/downloads/hoa-budget-template.pdf",
    );
    expect(result.alreadySubscribed).toBe(false);
  });

  it("rejects a non-URL downloadUrl", () => {
    expect(() =>
      SubscribeResponseSchema.parse({
        downloadUrl: "not a url",
        alreadySubscribed: true,
      }),
    ).toThrow(ZodError);
  });

  it("rejects a non-boolean alreadySubscribed", () => {
    expect(() =>
      SubscribeResponseSchema.parse({
        downloadUrl: "https://gavelhouse.app/downloads/x.pdf",
        alreadySubscribed: "no",
      }),
    ).toThrow(ZodError);
  });
});

describe("WaitlistSurveyRequestSchema", () => {
  it("accepts a valid survey token and bounded answer list", () => {
    const result = WaitlistSurveyRequestSchema.parse({
      surveyToken: "11111111-1111-4111-8111-111111111111",
      answers: [{ questionId: "community-size", answer: "25-50 homes" }],
    });

    expect(result.answers).toEqual([
      { questionId: "community-size", answer: "25-50 homes" },
    ]);
  });

  it("rejects malformed tokens and empty answer lists", () => {
    expect(() =>
      WaitlistSurveyRequestSchema.parse({
        surveyToken: "not-a-token",
        answers: [{ questionId: "community-size", answer: "25-50 homes" }],
      }),
    ).toThrow(ZodError);

    expect(() =>
      WaitlistSurveyRequestSchema.parse({
        surveyToken: "11111111-1111-4111-8111-111111111111",
        answers: [],
      }),
    ).toThrow(ZodError);
  });
});
