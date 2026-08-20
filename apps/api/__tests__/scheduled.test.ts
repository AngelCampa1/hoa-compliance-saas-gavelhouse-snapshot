import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Env } from "../src/types/env.js";

vi.mock("../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("../src/domain/billing/trialLifecycle.js", () => ({
  expireTrialsWithoutBillingSweep: vi.fn().mockResolvedValue(undefined),
  sendTrialStartedEmailSweep: vi.fn().mockResolvedValue(undefined),
  sendTrialEndingReminderSweep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/domain/governance/duesReminder.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../src/domain/governance/duesReminder.js")
    >();
  return {
    ...actual,
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../src/lib/observability.js", () => ({
  captureException: vi.fn(),
}));

import { scheduledHandler } from "../src/scheduled.js";
import * as dbClient from "../src/db/client.js";
import { captureException } from "../src/lib/observability.js";
import {
  expireTrialsWithoutBillingSweep,
  sendTrialEndingReminderSweep,
  sendTrialStartedEmailSweep,
} from "../src/domain/billing/trialLifecycle.js";
import { sendReminderEmail } from "../src/domain/governance/duesReminder.js";

const mockEnv = {
  RESEND_API_KEY: "test-key",
  BETTER_AUTH_SECRET: "secret",
  BETTER_AUTH_URL: "http://localhost",
  APP_URL: "http://localhost",
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_1",
  STRIPE_PRICE_STARTER_ANNUAL: "price_2",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_3",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_4",
  STRIPE_PRICE_SCALE_MONTHLY: "price_5",
  STRIPE_PRICE_SCALE_ANNUAL: "price_6",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_7",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_8",
};

describe("scheduledHandler cron gating", () => {
  it("does not run any scheduled work in shutdown mode", async () => {
    vi.mocked(expireTrialsWithoutBillingSweep).mockClear();
    vi.mocked(sendTrialStartedEmailSweep).mockClear();
    vi.mocked(sendTrialEndingReminderSweep).mockClear();
    vi.mocked(dbClient.createDb).mockClear();

    await scheduledHandler(
      { cron: "0 9 * * *" } as ScheduledEvent,
      { ...mockEnv, GAVELHOUSE_SHUTDOWN: "true" } as Env,
      {} as ExecutionContext,
    );

    expect(expireTrialsWithoutBillingSweep).not.toHaveBeenCalled();
    expect(sendTrialStartedEmailSweep).not.toHaveBeenCalled();
    expect(sendTrialEndingReminderSweep).not.toHaveBeenCalled();
    expect(dbClient.createDb).not.toHaveBeenCalled();
  });

  it("does not run local nurture sequence workers on the 09:00 UTC dues tick", async () => {
    vi.mocked(expireTrialsWithoutBillingSweep).mockClear();
    vi.mocked(sendTrialStartedEmailSweep).mockClear();
    vi.mocked(sendTrialEndingReminderSweep).mockClear();
    await scheduledHandler(
      { cron: "0 9 * * *" } as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );
    expect(expireTrialsWithoutBillingSweep).toHaveBeenCalledTimes(1);
    expect(sendTrialStartedEmailSweep).toHaveBeenCalledTimes(1);
    expect(sendTrialEndingReminderSweep).toHaveBeenCalledTimes(1);
  });
});

describe("scheduledHandler", () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
    vi.mocked(sendReminderEmail).mockReset();
    vi.mocked(sendReminderEmail).mockResolvedValue(undefined);
  });

  it("returns early when no reminder-interval assessments found", async () => {
    // Default mock returns [] for the where query → early return
    await expect(
      scheduledHandler(
        {} as ScheduledEvent,
        mockEnv as Env,
        {} as ExecutionContext,
      ),
    ).resolves.not.toThrow();
  });

  it("captures unhandled DB sweep failures", async () => {
    const sweepFailure = new Error("db unavailable");
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(sweepFailure),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await expect(
      scheduledHandler(
        { cron: "0 9 * * *" } as ScheduledEvent,
        mockEnv as Env,
        {} as ExecutionContext,
      ),
    ).resolves.not.toThrow();

    expect(captureException).toHaveBeenCalledWith(
      sweepFailure,
      expect.objectContaining({
        tags: { source: "scheduled", job: "unhandled-scheduled-task" },
        extra: { cron: "0 9 * * *" },
      }),
    );
  });

  it("sends reminders only for assessments at 1/7/14/30-day intervals", async () => {
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Assessments exactly at reminder intervals
          return Promise.resolve([
            {
              assessmentId: "a1",
              amountCents: 10000,
              dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
            },
          ]);
        }
        if (callCount === 2) {
          return Promise.resolve([{ id: "c1", name: "Test HOA" }]);
        }
        return Promise.resolve([
          {
            id: "h1",
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
            communityId: "c1",
            active: true,
          },
        ]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    expect(sendReminderEmail).toHaveBeenCalled();
  });

  it("sends reminder links with owner portal tokens", async () => {
    let callCount = 0;
    const values = vi.fn().mockResolvedValue(undefined);
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              assessmentId: "a-token",
              amountCents: 10000,
              dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
              unitId: null,
            },
          ]);
        }
        if (callCount === 2)
          return Promise.resolve([{ id: "c1", name: "Test HOA" }]);
        return Promise.resolve([
          {
            id: "h1",
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
            communityId: "c1",
            active: true,
          },
        ]);
      }),
      insert: vi.fn(() => ({ values })),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ homeownerId: "h1", communityId: "c1" }),
    );
    expect(vi.mocked(sendReminderEmail).mock.calls[0][0].html).toContain(
      "/portal?token=",
    );
  });

  it("captures error and continues when sendReminderEmail fails", async () => {
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              assessmentId: "a1",
              amountCents: 10000,
              dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
            },
          ]);
        }
        if (callCount === 2) {
          return Promise.resolve([{ id: "c1", name: "Test HOA" }]);
        }
        return Promise.resolve([
          {
            id: "h1",
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
            communityId: "c1",
            active: true,
          },
        ]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    vi.mocked(sendReminderEmail).mockRejectedValueOnce(
      new Error("Server Error"),
    );
    // Should not throw even though sendReminderEmail fails
    await expect(
      scheduledHandler(
        {} as ScheduledEvent,
        mockEnv as Env,
        {} as ExecutionContext,
      ),
    ).resolves.not.toThrow();

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: "scheduled", job: "dues-reminder-email" },
        extra: expect.objectContaining({
          assessmentId: "a1",
          communityId: "c1",
        }),
      }),
    );
  });

  it("sends email only to homeowner of the assessed unit (not all community homeowners)", async () => {
    // Assessment on unit A only. Homeowners: A (unit A), B (unit B), C (unit C).
    // Expected: exactly 1 email to homeowner A.
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // overdue assessments: 1 assessment on unit A
          return Promise.resolve([
            {
              assessmentId: "assess-a",
              amountCents: 20000,
              dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
              unitId: "unit-a",
            },
          ]);
        }
        if (callCount === 2) {
          // communities
          return Promise.resolve([{ id: "c1", name: "Sunrise HOA" }]);
        }
        if (callCount === 3) {
          // unitOwnerships for unit A → homeowner A
          return Promise.resolve([{ homeownerId: "h-a" }]);
        }
        // homeowners filtered by ownerIds (inArray)
        return Promise.resolve([
          {
            id: "h-a",
            firstName: "Alice",
            lastName: "Adams",
            email: "alice@example.com",
            communityId: "c1",
            active: true,
          },
        ]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    // Exactly 1 email sent (only to Alice/unit A, not Bob/unit B or Carol/unit C)
    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendReminderEmail).mock.calls[0][0].to).toBe(
      "alice@example.com",
    );
  });

  it("filters unit reminder recipients to current owners", async () => {
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              assessmentId: "assess-current",
              amountCents: 20000,
              dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
              unitId: "unit-a",
            },
          ]);
        }
        if (callCount === 2) {
          return Promise.resolve([{ id: "c1", name: "Sunrise HOA" }]);
        }
        if (callCount === 3) {
          return Promise.resolve([{ homeownerId: "h-current" }]);
        }
        return Promise.resolve([
          {
            id: "h-current",
            firstName: "Casey",
            lastName: "Current",
            email: "current@example.com",
            communityId: "c1",
            active: true,
          },
        ]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendReminderEmail).mock.calls[0][0].to).toBe(
      "current@example.com",
    );
  });

  it("skips sending when unit has no current owners", async () => {
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              assessmentId: "assess-b",
              amountCents: 15000,
              dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "c1",
              unitId: "unit-empty",
            },
          ]);
        }
        if (callCount === 2) {
          return Promise.resolve([{ id: "c1", name: "Sunrise HOA" }]);
        }
        // unitOwnerships: no owner for this unit
        return Promise.resolve([]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  it("uses fallback community name when community not in map", async () => {
    let callCount = 0;
    vi.mocked(dbClient.createDb).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              assessmentId: "a2",
              amountCents: 5000,
              dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              communityId: "unknown-c",
            },
          ]);
        }
        if (callCount === 2) {
          return Promise.resolve([]); // communities not found → empty map → fallback name
        }
        return Promise.resolve([
          {
            id: "h2",
            firstName: "Bob",
            lastName: "Brown",
            email: "bob@example.com",
            communityId: "unknown-c",
            active: true,
          },
        ]);
      }),
    } as unknown as ReturnType<typeof dbClient.createDb>);

    await scheduledHandler(
      {} as ScheduledEvent,
      mockEnv as Env,
      {} as ExecutionContext,
    );

    expect(sendReminderEmail).toHaveBeenCalled();
    // Verify the email body contains the fallback name
    expect(vi.mocked(sendReminderEmail).mock.calls[0][0].text).toContain(
      "Your HOA",
    );
  });
});
