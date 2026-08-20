import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}));

vi.mock("../../../src/domain/billing/trialEmails.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/domain/billing/trialEmails.js")
    >();
  return {
    ...actual,
    sendTrialEmail: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  expireTrialsWithoutBillingSweep,
  sendTrialEndingReminderSweep,
  sendTrialStartedEmailSweep,
  sendTrialStartedEmailForCommunity,
} from "../../../src/domain/billing/trialLifecycle.js";
import { sendTrialEmail } from "../../../src/domain/billing/trialEmails.js";
import type { Env } from "../../../src/types/env.js";

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
  STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
  RESEND_API_KEY: "resend_test",
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

function makeSingleRowSelectResult<T>(row: T) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([row]),
          })),
        })),
      })),
    })),
  };
}

function makeManyRowsSelectResult<T>(rows: T[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  };
}

describe("trialLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendTrialEmail).mockResolvedValue(undefined);
  });

  it("sends the trial started email and marks it sent", async () => {
    mockSelect.mockReturnValueOnce(
      makeSingleRowSelectResult({
        subscriptionId: "sub-1",
        stripeSubscriptionId: null,
        trialStartedAt: new Date("2026-04-01T00:00:00Z"),
        trialEndsAt: new Date("2026-05-01T00:00:00Z"),
        trialStartedEmailSentAt: null,
        tier: "starter",
        cycle: "monthly" as const,
        communityName: "Sunset HOA",
        ownerName: "Jane Owner",
        ownerEmail: "jane@example.com",
      }),
    );

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValueOnce({ set });

    await sendTrialStartedEmailForCommunity(mockEnv, "comm-1");

    expect(sendTrialEmail).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalled();
  });

  it("skips the trial started email when already sent", async () => {
    mockSelect.mockReturnValueOnce(
      makeSingleRowSelectResult({
        subscriptionId: "sub-1",
        stripeSubscriptionId: null,
        trialStartedAt: new Date("2026-04-01T00:00:00Z"),
        trialEndsAt: new Date("2026-05-01T00:00:00Z"),
        trialStartedEmailSentAt: new Date("2026-04-01T01:00:00Z"),
        tier: "starter",
        cycle: "monthly" as const,
        communityName: "Sunset HOA",
        ownerName: "Jane Owner",
        ownerEmail: "jane@example.com",
      }),
    );

    await sendTrialStartedEmailForCommunity(mockEnv, "comm-1");

    expect(sendTrialEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sends reminders only for trials ending in three days", async () => {
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-1",
          stripeSubscriptionId: null,
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: threeDaysOut,
          trialEndingReminderSentAt: null,
          tier: "starter",
          cycle: "monthly" as const,
          communityName: "Sunset HOA",
          ownerName: "Jane Owner",
          ownerEmail: "jane@example.com",
        },
        {
          subscriptionId: "sub-2",
          stripeSubscriptionId: null,
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          trialEndingReminderSentAt: null,
          tier: "mystery",
          cycle: "monthly" as const,
          communityName: "Other HOA",
          ownerName: null,
          ownerEmail: "other@example.com",
        },
      ]),
    );

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValue({ set });

    await sendTrialEndingReminderSweep(mockEnv);

    expect(sendTrialEmail).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("catches up a missed reminder: fires when the reminder date is in the past but the trial is still active", async () => {
    // A cron miss / late fire / clock skew can mean no sweep ran on the exact
    // reminder calendar date. Because the row is gated only by
    // trialEndingReminderSentAt, an exact `=== today` match would skip it
    // forever. The reminder must instead fire on the first sweep at or after
    // the reminder date, as long as the trial has not already ended.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z")); // today = 2026-05-01
    try {
      mockSelect.mockReturnValueOnce(
        makeManyRowsSelectResult([
          {
            subscriptionId: "sub-missed",
            stripeSubscriptionId: null,
            trialStartedAt: new Date("2026-04-01T00:00:00Z"),
            // Trial ends 2026-05-02 → reminderDate = 2026-04-29 (3 days prior),
            // which is before today (2026-05-01). The exact-match check skips
            // it; the corrected range check must still send.
            trialEndsAt: new Date("2026-05-02T00:00:00Z"),
            trialEndingReminderSentAt: null,
            tier: "starter",
            cycle: "monthly" as const,
            communityName: "Missed HOA",
            ownerName: "Late Owner",
            ownerEmail: "late@example.com",
          },
        ]),
      );

      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn(() => ({ where }));
      mockUpdate.mockReturnValue({ set });

      await sendTrialEndingReminderSweep(mockEnv);

      expect(sendTrialEmail).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not send a 'trial ending soon' reminder after the trial has already ended", async () => {
    // If a catch-up window is so late that the trial end date is already in the
    // past, sending an "ending in 3 days" email would be stale and wrong.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z")); // today = 2026-05-01
    try {
      mockSelect.mockReturnValueOnce(
        makeManyRowsSelectResult([
          {
            subscriptionId: "sub-ended",
            stripeSubscriptionId: null,
            trialStartedAt: new Date("2026-04-01T00:00:00Z"),
            // Trial already ended on 2026-04-30 (before today).
            trialEndsAt: new Date("2026-04-30T00:00:00Z"),
            trialEndingReminderSentAt: null,
            tier: "starter",
            cycle: "monthly" as const,
            communityName: "Ended HOA",
            ownerName: "Past Owner",
            ownerEmail: "past@example.com",
          },
        ]),
      );

      await sendTrialEndingReminderSweep(mockEnv);

      expect(sendTrialEmail).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries unsent trial started emails from the daily sweep", async () => {
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-retry",
          stripeSubscriptionId: null,
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: new Date("2026-05-01T00:00:00Z"),
          trialStartedEmailSentAt: null,
          tier: "starter",
          cycle: "monthly",
          communityName: "Retry HOA",
          ownerName: "Retry Owner",
          ownerEmail: "retry@example.com",
        },
      ]),
    );

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValue({ set });

    await sendTrialStartedEmailSweep(mockEnv);

    expect(sendTrialEmail).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("skips started-email sweep rows that are already sent or missing trial dates", async () => {
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-sent",
          stripeSubscriptionId: null,
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: new Date("2026-05-01T00:00:00Z"),
          trialStartedEmailSentAt: new Date("2026-04-01T01:00:00Z"),
          tier: "starter",
          cycle: "monthly",
          communityName: "Sent HOA",
          ownerName: "Sent Owner",
          ownerEmail: "sent@example.com",
        },
        {
          subscriptionId: "sub-missing-start",
          stripeSubscriptionId: null,
          trialStartedAt: null,
          trialEndsAt: new Date("2026-05-01T00:00:00Z"),
          trialStartedEmailSentAt: null,
          tier: "growth",
          cycle: "annual",
          communityName: "Missing Start HOA",
          ownerName: "Missing Start",
          ownerEmail: "missing-start@example.com",
        },
        {
          subscriptionId: "sub-missing-end",
          stripeSubscriptionId: null,
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: null,
          trialStartedEmailSentAt: null,
          tier: "growth",
          cycle: "annual",
          communityName: "Missing End HOA",
          ownerName: "Missing End",
          ownerEmail: "missing-end@example.com",
        },
      ]),
    );

    await sendTrialStartedEmailSweep(mockEnv);

    expect(sendTrialEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("uses fallback pricing text when the tier is unknown", async () => {
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-unknown",
          stripeSubscriptionId: "sub_stripe",
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          trialEndingReminderSentAt: null,
          tier: "mystery",
          cycle: "monthly",
          communityName: "Unknown HOA",
          ownerName: null,
          ownerEmail: "unknown@example.com",
        },
      ]),
    );

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValue({ set });

    await sendTrialEndingReminderSweep(mockEnv);

    expect(sendTrialEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("your monthly rate"),
      }),
      mockEnv.RESEND_API_KEY,
    );
  });

  it("uses annual pricing labels in trial emails when the cycle is annual", async () => {
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-annual",
          stripeSubscriptionId: "sub_stripe",
          trialStartedAt: new Date("2026-04-01T00:00:00Z"),
          trialEndsAt: threeDaysOut,
          trialEndingReminderSentAt: null,
          tier: "growth",
          cycle: "annual",
          communityName: "Annual HOA",
          ownerName: "Annual Owner",
          ownerEmail: "annual@example.com",
        },
      ]),
    );

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValue({ set });

    await sendTrialEndingReminderSweep(mockEnv);

    expect(sendTrialEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("$1620.00/year"),
      }),
      mockEnv.RESEND_API_KEY,
    );
  });

  it("skips reminder rows with missing trial dates or prior sends", async () => {
    mockSelect.mockReturnValueOnce(
      makeManyRowsSelectResult([
        {
          subscriptionId: "sub-1",
          stripeSubscriptionId: null,
          trialStartedAt: null,
          trialEndsAt: new Date(),
          trialEndingReminderSentAt: null,
          tier: "starter",
          cycle: "monthly" as const,
          communityName: "Sunset HOA",
          ownerName: "Jane Owner",
          ownerEmail: "jane@example.com",
        },
        {
          subscriptionId: "sub-2",
          stripeSubscriptionId: null,
          trialStartedAt: new Date(),
          trialEndsAt: null,
          trialEndingReminderSentAt: null,
          tier: "starter",
          cycle: "monthly" as const,
          communityName: "Sunset HOA",
          ownerName: "Jane Owner",
          ownerEmail: "jane@example.com",
        },
        {
          subscriptionId: "sub-3",
          stripeSubscriptionId: null,
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          trialEndingReminderSentAt: new Date(),
          tier: "starter",
          cycle: "monthly" as const,
          communityName: "Sunset HOA",
          ownerName: "Jane Owner",
          ownerEmail: "jane@example.com",
        },
      ]),
    );

    await sendTrialEndingReminderSweep(mockEnv);

    expect(sendTrialEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("expires only local trials that have ended", async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            subscriptionId: "sub-expire",
            trialEndsAt: new Date("2026-04-01T00:00:00Z"),
            stripeSubscriptionId: null,
          },
          {
            subscriptionId: "sub-future",
            trialEndsAt: new Date("2026-06-01T00:00:00Z"),
            stripeSubscriptionId: null,
          },
          {
            subscriptionId: "sub-billed",
            trialEndsAt: new Date("2026-04-01T00:00:00Z"),
            stripeSubscriptionId: "sub_stripe",
          },
          {
            subscriptionId: "sub-missing-date",
            trialEndsAt: null,
            stripeSubscriptionId: null,
          },
        ]),
      })),
    });

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockUpdate.mockReturnValue({ set });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    await expireTrialsWithoutBillingSweep(mockEnv);

    vi.useRealTimers();

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "expired",
      }),
    );
  });
});
