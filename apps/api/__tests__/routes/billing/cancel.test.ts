import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
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
  POSTHOG_KEY: "phc_test_key",
};

const mockGetSession = vi.fn();

vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

const mockSubscriptionsUpdate = vi.fn();

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      subscriptions: { update: mockSubscriptionsUpdate },
    };
  }
  StripeMock.createFetchHttpClient = () => null;
  return { default: StripeMock };
});

// Mock global fetch for PostHog fire-and-forget
const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
vi.stubGlobal("fetch", mockFetch);

const cancelModule = await import("../../../src/routes/billing/cancel.js");
const cancelRouter = cancelModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", cancelRouter);
  return app;
}

async function makeRequest(
  path: string,
  options: RequestInit,
  env: Env,
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

async function jsonPost(body: unknown, env: Env = mockEnv): Promise<Response> {
  return makeRequest(
    "/billing/cancel",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("POST /billing/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response("", { status: 200 }));
    mockUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          // Default: the conditional flip succeeds (row was still
          // cancelAtPeriodEnd=false), so churn + event proceed.
          returning: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", cancelAtPeriodEnd: true },
            ]),
        })),
      })),
    });
  });

  it("returns 401 when there is no session", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the user is not a member of the community", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership not found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 403 when the user is a community member with role 'member' (not owner/admin)", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found but role is "member" — not owner or admin
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 400 when reason is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "not_a_valid_reason",
    });

    expect(res.status).toBe(400);
  });

  it("returns 200 success: inserts churnReason, calls Stripe, returns success response", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_abc123",
              tier: "starter",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: "sub_abc123" });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
      note: "Costs too much for our small community",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, cancelAtPeriodEnd: true });

    // churnReason was inserted
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-id",
        communityId: "comm-1",
        userId: "user-1",
        reason: "too_expensive",
        note: "Costs too much for our small community",
      }),
    );

    // Stripe was called with cancel_at_period_end
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_abc123", {
      cancel_at_period_end: true,
    });
  });

  it("returns success without duplicating side effects when cancellation is already scheduled", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_abc123",
              tier: "starter",
              cancelAtPeriodEnd: true,
            },
          ]),
        })),
      })),
    });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      cancelAtPeriodEnd: true,
    });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not duplicate churn/event when a concurrent cancel wins the conditional flip", async () => {
    // The SELECTed row is still cancelAtPeriodEnd=false (JS guard passes), but a
    // concurrent request flips it first, so the conditional UPDATE matches zero
    // rows. The loser must return success WITHOUT inserting a second churn row.
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription found, still open at SELECT time
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_abc123",
              tier: "starter",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    // Conditional UPDATE matches zero rows — the race was lost.
    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: "sub_abc123" });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      cancelAtPeriodEnd: true,
    });
    // The race loser must NOT record a second churn row.
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each(["canceled", "expired"] as const)(
    "returns success without touching Stripe for terminal status %s",
    async (status) => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "user-1" },
        session: {},
      });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "owner" },
              ]),
          })),
        })),
      });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                communityId: "comm-1",
                stripeSubscriptionId: "sub_terminal",
                tier: "starter",
                status,
                cancelAtPeriodEnd: false,
              },
            ]),
          })),
        })),
      });

      const res = await jsonPost({
        communityId: "comm-1",
        reason: "too_expensive",
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        cancelAtPeriodEnd: true,
      });
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for an expired trial that was never activated in Stripe", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // expired trial: status "expired" but never activated in Stripe
    // (stripeSubscriptionId null — the exact state trialLifecycle expiry produces)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: null,
              tier: "starter",
              status: "expired",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "too_expensive",
    });

    // There is no Stripe subscription to cancel — the documented contract is
    // 404, not a misleading { cancelAtPeriodEnd: true } success response.
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "No active subscription found" });

    // No churn row recorded, no Stripe call made.
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when subscription exists but has no stripeSubscriptionId", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription found but no stripeSubscriptionId
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: null,
              tier: "starter",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await jsonPost({
      communityId: "comm-1",
      reason: "board_dissolved",
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "No active subscription found" });

    // Churn reason must NOT be recorded (no Stripe subscription to cancel)
    expect(mockValues).not.toHaveBeenCalled();

    // Stripe was NOT called
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 when Stripe throws: no churn row inserted (Stripe confirmation required)", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "admin" },
            ]),
        })),
      })),
    });

    // subscription found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_failing",
              tier: "growth",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    mockSubscriptionsUpdate.mockRejectedValueOnce(
      new Error("Stripe network error"),
    );

    const app = new Hono<{ Bindings: typeof mockEnv }>();
    app.route(
      "/",
      (await import("../../../src/routes/billing/cancel.js")).default,
    );
    app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));
    const req = new Request("http://localhost/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        reason: "bug_or_reliability",
      }),
    });
    const res = await app.fetch(req, mockEnv);

    // Stripe failure now propagates → 500 so the caller knows to retry
    expect(res.status).toBe(500);

    // Churn reason must NOT have been recorded (Stripe didn't confirm)
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("fires PostHog event as fire-and-forget with correct properties", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-42" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-99", userId: "user-42", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-99",
              stripeSubscriptionId: "sub_xyz",
              tier: "scale",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: "sub_xyz" });

    const res = await jsonPost(
      { communityId: "comm-99", reason: "missing_feature" },
      mockEnv,
    );

    expect(res.status).toBe(200);

    // Give fire-and-forget a tick to schedule
    await new Promise((r) => setTimeout(r, 0));

    // PostHog fetch should have been called (at least once — the route
    // also triggers the captureEvent middleware in index.ts, but here
    // we're testing the standalone cancel router so only our event fires)
    const posthogCalls = mockFetch.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("posthog"),
    );
    expect(posthogCalls.length).toBeGreaterThanOrEqual(1);

    const [, initOptions] = posthogCalls[0] as [string, RequestInit];
    const payload = JSON.parse(initOptions.body as string) as {
      event: string;
      properties: Record<string, unknown>;
    };
    expect(payload.event).toBe("subscription_cancelled");
    expect(payload.properties.reason).toBe("missing_feature");
    expect(payload.properties.community_id).toBe("comm-99");
    expect(payload.properties.tier).toBe("scale");
  });

  it("skips PostHog capture when POSTHOG_KEY is absent", async () => {
    const envWithoutPosthog: Env = { ...mockEnv, POSTHOG_KEY: undefined };

    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription with a valid stripeSubscriptionId
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_no_posthog",
              tier: "starter",
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: "sub_no_posthog" });

    const res = await jsonPost(
      { communityId: "comm-1", reason: "other" },
      envWithoutPosthog,
    );

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 0));

    // No PostHog fetch call since key is absent
    const posthogCalls = mockFetch.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("posthog"),
    );
    expect(posthogCalls.length).toBe(0);
  });

  it("falls back to 'starter' tier in PostHog event when subscription tier is null", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // subscription found — tier is null (covers the ?? "starter" branch)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              communityId: "comm-1",
              stripeSubscriptionId: "sub_notier",
              tier: null,
              cancelAtPeriodEnd: false,
            },
          ]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: "sub_notier" });

    const res = await jsonPost(
      { communityId: "comm-1", reason: "too_expensive" },
      mockEnv,
    );

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 0));

    const posthogCalls = mockFetch.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("posthog"),
    );
    expect(posthogCalls.length).toBeGreaterThanOrEqual(1);

    const [, initOptions] = posthogCalls[0] as [string, RequestInit];
    const payload = JSON.parse(initOptions.body as string) as {
      properties: { tier: string };
    };
    expect(payload.properties.tier).toBe("starter");
  });

  it("returns 404 when no subscription row exists at all", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: {},
    });

    // membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // no subscription row at all
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await jsonPost(
      { communityId: "comm-1", reason: "switched_to_manager" },
      mockEnv,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "No active subscription found" });

    // Churn reason must NOT be recorded
    expect(mockValues).not.toHaveBeenCalled();

    // Stripe should NOT be called (no subscription)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });
});
