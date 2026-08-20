import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  TrialStatus,
  BillingCycle,
  TierSlug,
  checkoutRequest,
  startTrialRequest,
  billingStatusResponse,
} from "../../src/schemas/billing.js";

describe("TrialStatus", () => {
  it("accepts all valid statuses", () => {
    const statuses = [
      "pending_trial",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "expired",
    ] as const;
    for (const status of statuses) {
      expect(TrialStatus.parse(status)).toBe(status);
    }
  });

  it("rejects an invalid status", () => {
    expect(() => TrialStatus.parse("pending")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => TrialStatus.parse("")).toThrow(ZodError);
  });
});

describe("BillingCycle", () => {
  it("accepts monthly", () => {
    expect(BillingCycle.parse("monthly")).toBe("monthly");
  });

  it("accepts annual", () => {
    expect(BillingCycle.parse("annual")).toBe("annual");
  });

  it("rejects invalid cycle", () => {
    expect(() => BillingCycle.parse("weekly")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => BillingCycle.parse("")).toThrow(ZodError);
  });
});

describe("TierSlug", () => {
  it("accepts all valid tier slugs", () => {
    const slugs = ["starter", "growth", "scale", "portfolio"] as const;
    for (const slug of slugs) {
      expect(TierSlug.parse(slug)).toBe(slug);
    }
  });

  it("rejects invalid tier slug", () => {
    expect(() => TierSlug.parse("enterprise")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => TierSlug.parse("")).toThrow(ZodError);
  });
});

describe("checkoutRequest", () => {
  it("parses a valid checkout request", () => {
    const result = checkoutRequest.parse({
      communityId: "comm-123",
      tier: "starter",
      cycle: "monthly",
      successUrl: "https://app.gavelhouse.app/success",
      cancelUrl: "https://app.gavelhouse.app/cancel",
    });
    expect(result.communityId).toBe("comm-123");
    expect(result.tier).toBe("starter");
    expect(result.cycle).toBe("monthly");
  });

  it("parses annual cycle", () => {
    const result = checkoutRequest.parse({
      communityId: "comm-456",
      tier: "growth",
      cycle: "annual",
      successUrl: "https://app.gavelhouse.app/success",
      cancelUrl: "https://app.gavelhouse.app/cancel",
    });
    expect(result.cycle).toBe("annual");
  });

  it("rejects empty communityId", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "",
        tier: "starter",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid tier", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "comm-123",
        tier: "free",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("rejects portfolio checkout because it is a custom path", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "comm-123",
        tier: "portfolio",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid cycle", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "comm-123",
        tier: "starter",
        cycle: "weekly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("rejects non-URL successUrl", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "comm-123",
        tier: "starter",
        cycle: "monthly",
        successUrl: "not-a-url",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("rejects non-URL cancelUrl", () => {
    expect(() =>
      checkoutRequest.parse({
        communityId: "comm-123",
        tier: "starter",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "not-a-url",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing communityId", () => {
    expect(() =>
      checkoutRequest.parse({
        tier: "starter",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      }),
    ).toThrow(ZodError);
  });

  it("accepts priced tier slugs in checkout", () => {
    const tiers = ["starter", "growth", "scale"] as const;
    for (const tier of tiers) {
      const result = checkoutRequest.parse({
        communityId: "comm-123",
        tier,
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/success",
        cancelUrl: "https://app.gavelhouse.app/cancel",
      });
      expect(result.tier).toBe(tier);
    }
  });
});

describe("startTrialRequest", () => {
  it("parses a start-trial request without plan selection", () => {
    const result = startTrialRequest.parse({
      communityId: "comm-789",
    });
    expect(result).toEqual({
      communityId: "comm-789",
    });
  });

  it("accepts legacy plan fields without requiring them", () => {
    const result = startTrialRequest.parse({
      communityId: "comm-789",
      tier: "starter",
      cycle: "monthly",
    });
    expect(result).toEqual({
      communityId: "comm-789",
      tier: "starter",
      cycle: "monthly",
    });
  });
});

describe("billingStatusResponse", () => {
  const validStatus = {
    status: "active" as const,
    tier: "starter" as const,
    cycle: "monthly" as const,
    trialStartedAt: "2025-12-01T00:00:00.000Z",
    trialEndsAt: "2026-01-01T00:00:00.000Z",
    currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  };

  it("parses a complete active billing status", () => {
    const result = billingStatusResponse.parse(validStatus);
    expect(result).toEqual(validStatus);
  });

  it("accepts null nullable fields for a trialing subscription", () => {
    const result = billingStatusResponse.parse({
      status: "trialing",
      tier: "growth",
      cycle: null,
      trialStartedAt: "2025-12-01T00:00:00.000Z",
      trialEndsAt: "2026-01-01T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(result.status).toBe("trialing");
    expect(result.cycle).toBeNull();
    expect(result.currentPeriodEnd).toBeNull();
  });

  it("accepts cancelAtPeriodEnd: true", () => {
    const result = billingStatusResponse.parse({
      ...validStatus,
      cancelAtPeriodEnd: true,
    });
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it("accepts all valid TrialStatus values", () => {
    const statuses = [
      "pending_trial",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "expired",
    ] as const;
    for (const status of statuses) {
      const result = billingStatusResponse.parse({ ...validStatus, status });
      expect(result.status).toBe(status);
    }
  });

  it("rejects an invalid status value", () => {
    expect(() =>
      billingStatusResponse.parse({ ...validStatus, status: "unknown" }),
    ).toThrow();
  });

  it("rejects an invalid tier value", () => {
    expect(() =>
      billingStatusResponse.parse({ ...validStatus, tier: "enterprise" }),
    ).toThrow();
  });
});
