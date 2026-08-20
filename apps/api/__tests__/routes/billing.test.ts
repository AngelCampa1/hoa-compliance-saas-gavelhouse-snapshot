import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

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
};

const mockGetSession = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
}));

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockDbSelect,
    update: mockDbUpdate,
  })),
}));

const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
const mockPortalSessionsCreate = vi.fn();
const mockConstructEventAsync = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockPricesRetrieve = vi.fn();
const mockCouponsRetrieve = vi.fn();
const mockCaptureException = vi.fn(() => "event-billing-123");
const mockCaptureEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/lib/observability.js", () => ({
  captureException: mockCaptureException,
  captureEvent: mockCaptureEvent,
  buildInternalErrorBody: vi.fn((trackingId?: string) => ({
    error: "Something went wrong. Please try again.",
    ...(trackingId ? { trackingId } : {}),
  })),
}));

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      customers: { create: mockCustomersCreate },
      checkout: { sessions: { create: mockCheckoutSessionsCreate } },
      prices: { retrieve: mockPricesRetrieve },
      billingPortal: { sessions: { create: mockPortalSessionsCreate } },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
      webhooks: { constructEventAsync: mockConstructEventAsync },
      coupons: { retrieve: mockCouponsRetrieve },
    };
  }
  StripeMock.createFetchHttpClient = () => null;
  return { default: StripeMock };
});

const billingModule = await import("../../src/routes/billing.js");
const billingRouter = billingModule.default;
const {
  isTrustedBillingUrl,
  normalizeSubscriptionStatus,
  resolveTierFromPriceId,
  resolveCycleFromPriceId,
  resetActiveLaunchPhaseCache,
} = billingModule;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", billingRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

/** Return a membership-found mock for mockDbSelect */
function memberFound() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ id: "m1", role: "owner" }]),
      })),
    })),
  };
}

/** Return a membership-not-found mock for mockDbSelect */
function memberNotFound() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  };
}

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPricesRetrieve.mockResolvedValue({ currency: "usd" });
    resetActiveLaunchPhaseCache();
    mockCouponsRetrieve.mockResolvedValue({
      id: "Y80OFF",
      times_redeemed: 0,
      max_redemptions: 200,
      valid: true,
      percent_off: 80,
    });
  });

  describe("POST /billing/start-trial", () => {
    it("starts a full-app trial locally without locking in a paid plan", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "pending_trial",
              },
            ]),
          })),
        })),
      });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/start-trial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "trialing",
          tier: "scale",
          cycle: null,
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: null,
        }),
      );
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({
          status: "trialing",
          tier: "scale",
          cycle: null,
          cancelAtPeriodEnd: false,
        }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "trial_started",
        expect.objectContaining({
          community_id: "c1",
          tier: "scale",
          billing_period: null,
        }),
        "u1",
        mockEnv,
      );
    });

    it("returns the current trial when duplicate start-trial is already trialing", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      // Anchor the trial window to the real current time so the row reads as
      // unambiguously active (started yesterday, ends in 13 days) regardless of
      // the calendar date the suite runs on. Hardcoded dates made this a
      // date-bomb: once "now" passed trialEndsAt the endpoint recomputed the
      // status as "expired" and the assertion broke.
      const trialStartedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const trialEndsAt = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "trialing",
                tier: "growth",
                cycle: "annual",
                trialStartedAt,
                trialEndsAt,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/start-trial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "trialing",
        tier: "growth",
        cycle: "annual",
        trialStartedAt: trialStartedAt.toISOString(),
        trialEndsAt: trialEndsAt.toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("rejects starting a trial after the community has left pending trial", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ status: "expired" }]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/start-trial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "A free trial can only be started once per community",
      });
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("starts a scale trial as the full self-serve tier", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "pending_trial",
              },
            ]),
          })),
        })),
      });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/start-trial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "scale",
            cycle: "annual",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        status: "trialing",
        tier: "scale",
        cycle: null,
      });
      expect(mockDbSelect).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe("POST /billing/checkout", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member of the community (C-1)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u-attacker", email: "evil@bad.com", name: "Attacker" },
      });
      mockDbSelect.mockReturnValueOnce(memberNotFound());

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "other-community",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 403 when the caller is not an owner or admin", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "viewer@example.com", name: "Viewer" },
      });
      mockDbSelect.mockReturnValueOnce(memberNotFound());

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 for untrusted billing return URLs", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "A" },
      });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "https://evil.example/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid billing return URL",
      });
    });

    it("rejects localhost billing return URLs outside local development", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "A" },
      });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "https://app.gavelhouse-staging.com/cancel",
          }),
        },
        {
          ...mockEnv,
          APP_URL: "https://app.gavelhouse-staging.com",
        },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid billing return URL",
      });
    });

    it("returns 404 when subscription not found", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "A" },
      });
      // membership check passes
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup returns empty
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "missing",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("creates checkout session with existing customer when stripeCustomerId present", async () => {
      const trialEndsAt = new Date("2026-06-01T00:00:00.000Z");
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      // membership check
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "trialing",
                cycle: "monthly",
                trialEndsAt,
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ url: "https://checkout.stripe.com/session" });
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeCustomerId: "cus_existing",
          tier: "starter",
        }),
      );
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_collection: "always",
          subscription_data: {
            trial_end: Math.floor(trialEndsAt.getTime() / 1000),
            metadata: {
              communityId: "c1",
              tier: "starter",
              cycle: "monthly",
              userId: "u1",
            },
          },
          metadata: {
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            userId: "u1",
          },
        }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "billing_checkout_started",
        expect.objectContaining({
          community_id: "c1",
          tier: "starter",
          billing_period: "monthly",
        }),
        "u1",
        mockEnv,
      );
    });

    it("allows checkout restart when the subscription is expired", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/restart-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          cycle: "monthly",
          tier: "starter",
        }),
      );
    });

    it("converts an unswept elapsed local trial into an expired restart before checkout", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                stripeSubscriptionId: null,
                status: "trialing",
                cycle: "monthly",
                trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/restart-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const firstWhere = vi.fn().mockResolvedValue(undefined);
      const firstSet = vi.fn(() => ({ where: firstWhere }));
      const secondWhere = vi.fn().mockResolvedValue(undefined);
      const secondSet = vi.fn(() => ({ where: secondWhere }));
      mockDbUpdate
        .mockReturnValueOnce({ set: firstSet })
        .mockReturnValueOnce({ set: secondSet });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      vi.useRealTimers();

      expect(res.status).toBe(200);
      expect(firstSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "expired",
        }),
      );
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: {
            metadata: {
              communityId: "c1",
              tier: "starter",
              cycle: "monthly",
              userId: "u1",
            },
          },
        }),
      );
      expect(secondSet).toHaveBeenCalledWith(
        expect.objectContaining({
          cycle: "monthly",
          tier: "starter",
        }),
      );
    });

    it("creates annual self-serve checkout when annual pricing is selected", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: null,
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCustomersCreate.mockResolvedValueOnce({ id: "cus_annual" });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/annual-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            {
              price: "price_growth_annual",
              quantity: 1,
            },
          ],
          subscription_data: {
            metadata: {
              communityId: "c1",
              tier: "growth",
              cycle: "annual",
              userId: "u1",
            },
          },
        }),
      );
    });

    it("honors the requested cycle when restarting an expired subscription", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
                cycle: "monthly",
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/annual-restart-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            {
              price: "price_growth_annual",
              quantity: 1,
            },
          ],
        }),
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          cycle: "annual",
          tier: "growth",
        }),
      );
    });

    it("auto-applies Y80OFF for annual subscription checkout", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/annual-limited-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "scale",
            cycle: "annual",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      vi.useRealTimers();

      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ coupon: "Y80OFF" }],
          line_items: [{ price: "price_scale_annual", quantity: 1 }],
        }),
      );
    });

    it("rejects Portfolio checkout because Portfolio is a custom path", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "portfolio",
            cycle: "annual",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("auto-applies M80OFF for monthly subscription checkout", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/monthly-limited-session",
      });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      vi.useRealTimers();

      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ coupon: "M80OFF" }],
          line_items: [{ price: "price_starter_monthly", quantity: 1 }],
        }),
      );
    });

    it("proceeds without a discount when the cycle offer is exhausted", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCouponsRetrieve.mockResolvedValueOnce({
        id: "M80OFF",
        times_redeemed: 100,
        max_redemptions: 100,
        valid: true,
        percent_off: 80,
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/no-limited-offer-session",
      });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      vi.useRealTimers();

      expect(res.status).toBe(200);
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({ discounts: expect.anything() }),
      );
    });

    it("rejects checkout when the configured Stripe price is not USD", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "mxn" });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "growth",
            cycle: "annual",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "Something went wrong. Please try again.",
        trackingId: "event-billing-123",
      });
      expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: { source: "billing", job: "checkout-price-currency" },
        extra: { communityId: "c1", tier: "growth", cycle: "annual" },
      });
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("rejects checkout when the subscription is already active", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "active",
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid tier in body", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });
      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "invalid-tier",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("throws when price env var is missing (getPriceId error path)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: null },
      });
      // membership check
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: "cus_existing",
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session",
      });

      // Use env without the scale monthly price
      const envMissingPrice: Env = {
        ...mockEnv,
        STRIPE_PRICE_SCALE_MONTHLY: "",
      };
      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "scale",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        envMissingPrice,
      );
      // Should return 500 (unhandled error) when price env var is missing
      expect(res.status).toBe(500);
    });

    it("handles user with no name (null name in session)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: null },
      });
      // membership check
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: null,
                status: "expired",
              },
            ]),
          })),
        })),
      });
      mockCustomersCreate.mockResolvedValueOnce({ id: "cus_new2" });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session2",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: undefined }),
        expect.objectContaining({ idempotencyKey: "community-c1-customer" }),
      );
    });

    it("passes idempotencyKey on Stripe customer create to prevent duplicate customers", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "User A" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                stripeCustomerId: null,
                status: "trialing",
                trialEndsAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      mockCustomersCreate.mockResolvedValueOnce({ id: "cus_idempotent" });
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/idempotent-session",
      });
      mockPricesRetrieve.mockResolvedValueOnce({ currency: "usd" });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            tier: "starter",
            cycle: "monthly",
            successUrl: "http://localhost:3060/success",
            cancelUrl: "http://localhost:3060/cancel",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: "a@b.com" }),
        { idempotencyKey: "community-c1-customer" },
      );
    });
  });

  describe("POST /billing/portal", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member of the community (C-1)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u-attacker", email: "evil@bad.com" },
      });
      mockDbSelect.mockReturnValueOnce(memberNotFound());

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "other-community",
            returnUrl: "http://localhost:3060",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 403 when the caller is not an owner or admin", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u-attacker", email: "viewer@bad.com" },
      });
      mockDbSelect.mockReturnValueOnce(memberNotFound());

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060/billing",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 for an untrusted portal return URL", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "https://evil.example",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid billing return URL",
      });
    });

    it("rejects localhost portal return URLs outside local development", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060/billing",
          }),
        },
        {
          ...mockEnv,
          APP_URL: "https://app.gavelhouse-staging.com",
        },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid billing return URL",
      });
    });

    it("returns 404 when no billing setup (no stripeCustomerId)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });
      // membership check passes
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup returns row with no customerId
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ stripeCustomerId: null }]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "No billing setup" });
    });

    it("returns 404 when subscription not found", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });
      // membership check passes
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup returns empty
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("returns portal URL on success", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "u1", email: "a@b.com" },
      });
      // membership check
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription lookup
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ stripeCustomerId: "cus_123" }]),
          })),
        })),
      });
      mockPortalSessionsCreate.mockResolvedValueOnce({
        url: "https://billing.stripe.com/portal",
      });

      const res = await makeRequest(
        "/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "c1",
            returnUrl: "http://localhost:3060",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ url: "https://billing.stripe.com/portal" });
    });
  });

  describe("GET /billing/status", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      const res = await makeRequest(
        "/billing/status",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 403 when user is not a community member", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      mockDbSelect.mockReturnValueOnce(memberNotFound());
      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 when subscription not found", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      // membership found
      mockDbSelect.mockReturnValueOnce(memberFound());
      // subscription not found
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });
      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("returns billing status when found", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      const trialEndsAt = new Date("2026-02-01T00:00:00Z");
      const currentPeriodEnd = new Date("2026-03-01T00:00:00Z");
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "trialing",
                tier: "starter",
                cancelAtPeriodEnd: true,
                trialEndsAt,
                currentPeriodEnd,
              },
            ]),
          })),
        })),
      });
      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        tier: string;
        trialStartedAt: string | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
      };
      expect(body.status).toBe("trialing");
      expect(body.tier).toBe("starter");
      expect(body.trialStartedAt).toBeNull();
      expect(body.trialEndsAt).toBe("2026-02-01T00:00:00.000Z");
      expect(body.currentPeriodEnd).toBe("2026-03-01T00:00:00.000Z");
      expect(body.cancelAtPeriodEnd).toBe(true);
    });

    it("returns expired when a local trial has already elapsed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-05T00:00:00Z"));

      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "trialing",
                tier: "starter",
                cycle: null,
                stripeSubscriptionId: null,
                trialStartedAt: new Date("2026-01-01T00:00:00Z"),
                trialEndsAt: new Date("2026-02-01T00:00:00Z"),
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );

      vi.useRealTimers();

      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("expired");
    });

    it("returns null currentPeriodEnd when not set", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "u1", name: "Alice" },
      });
      mockDbSelect.mockReturnValueOnce(memberFound());
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                status: "trialing",
                tier: "starter",
                trialEndsAt: new Date("2026-02-01T00:00:00Z"),
                currentPeriodEnd: null,
              },
            ]),
          })),
        })),
      });
      const res = await makeRequest(
        "/billing/status?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { currentPeriodEnd: string | null };
      expect(body.currentPeriodEnd).toBeNull();
    });
  });

  describe("billing helpers", () => {
    it("treats malformed URLs as untrusted", () => {
      expect(isTrustedBillingUrl(mockEnv, "not-a-url")).toBe(false);
    });

    it("falls back to metadata tier and cycle when the price id is unknown", () => {
      expect(resolveTierFromPriceId(mockEnv, "price_unknown", "growth")).toBe(
        "growth",
      );
      expect(resolveCycleFromPriceId(mockEnv, "price_unknown", "annual")).toBe(
        "annual",
      );
    });

    it("normalizes elapsed local trials to expired", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-05T00:00:00Z"));

      expect(
        normalizeSubscriptionStatus({
          status: "trialing",
          stripeSubscriptionId: null,
          trialEndsAt: new Date("2026-02-01T00:00:00Z"),
        }),
      ).toBe("expired");
      expect(
        normalizeSubscriptionStatus({
          status: "trialing",
          stripeSubscriptionId: "sub_123",
          trialEndsAt: new Date("2026-02-01T00:00:00Z"),
        }),
      ).toBe("trialing");

      vi.useRealTimers();
    });
  });

  describe("GET /billing/limited-offer", () => {
    it("returns a public limited subscription offer without internal coupon details", async () => {
      mockCouponsRetrieve
        .mockResolvedValueOnce({
          id: "M80OFF",
          times_redeemed: 5,
          max_redemptions: 100,
          valid: true,
          percent_off: 80,
        })
        .mockResolvedValueOnce({
          id: "Y80OFF",
          times_redeemed: 12,
          max_redemptions: 200,
          valid: true,
          percent_off: 80,
        });
      const res = await makeRequest(
        "/billing/limited-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalRedemptionLimit?: unknown;
        offers: Array<Record<string, unknown>>;
      };
      expect(body).toMatchObject({
        id: "limited-80-off",
        shortLabel: "Limited time offer",
        offerLabel: "80% off the first year",
        badgeLabel: "80% off first year",
        percentOff: 80,
        offers: [
          {
            cycle: "monthly",
            code: "M80OFF",
            terms: "80% off your first year",
            available: true,
          },
          {
            cycle: "annual",
            code: "Y80OFF",
            terms: "80% off your first year",
            available: true,
          },
        ],
      });
      expect("totalRedemptionLimit" in body).toBe(false);
      for (const offer of body.offers) {
        expect("couponId" in offer).toBe(false);
        expect("redeemed" in offer).toBe(false);
        expect("limit" in offer).toBe(false);
      }
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    });

    it("does not keep the retired launch-offer endpoint public", async () => {
      const res = await makeRequest(
        "/billing/launch-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("returns the limited offer when only one coupon has capacity", async () => {
      mockCouponsRetrieve
        .mockResolvedValueOnce({
          id: "M80OFF",
          times_redeemed: 100,
          max_redemptions: 100,
          valid: true,
          percent_off: 80,
        })
        .mockResolvedValueOnce({
          id: "Y80OFF",
          times_redeemed: 0,
          max_redemptions: 200,
          valid: true,
          percent_off: 80,
        });
      const res = await makeRequest(
        "/billing/limited-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { offers: unknown[] };
      expect(body.offers).toEqual([
        expect.objectContaining({ code: "M80OFF", available: false }),
        expect.objectContaining({ code: "Y80OFF", available: true }),
      ]);
    });

    it("returns 404 when both limited offer coupon pools are exhausted", async () => {
      mockCouponsRetrieve.mockResolvedValue({
        id: "coupon",
        times_redeemed: 200,
        max_redemptions: 100,
        valid: true,
        percent_off: 80,
      });
      const res = await makeRequest(
        "/billing/limited-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("uses Stripe coupon IDs from the shared offer by default", async () => {
      mockCouponsRetrieve.mockResolvedValue({
        id: "Y80OFF",
        times_redeemed: 0,
        max_redemptions: 200,
        valid: true,
        percent_off: 80,
      });
      const res = await makeRequest(
        "/billing/limited-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockCouponsRetrieve).toHaveBeenCalledWith("M80OFF");
      expect(mockCouponsRetrieve).toHaveBeenCalledWith("Y80OFF");
    });

    it("uses the cache on a second call within TTL", async () => {
      mockCouponsRetrieve.mockResolvedValue({
        id: "M80OFF",
        times_redeemed: 0,
        max_redemptions: 100,
        valid: true,
        percent_off: 80,
      });
      await makeRequest("/billing/limited-offer", { method: "GET" }, mockEnv);
      await makeRequest("/billing/limited-offer", { method: "GET" }, mockEnv);
      expect(mockCouponsRetrieve).toHaveBeenCalledTimes(2);
    });

    it("caches the null result when both coupon pools are exhausted to prevent Stripe stampede", async () => {
      mockCouponsRetrieve.mockResolvedValue({
        id: "coupon",
        times_redeemed: 100,
        max_redemptions: 100,
        valid: true,
        percent_off: null,
      });
      await makeRequest("/billing/limited-offer", { method: "GET" }, mockEnv);
      await makeRequest("/billing/limited-offer", { method: "GET" }, mockEnv);
      expect(mockCouponsRetrieve).toHaveBeenCalledTimes(2);
    });

    it("skips one offer and continues when stripe.coupons.retrieve throws", async () => {
      mockCouponsRetrieve
        .mockRejectedValueOnce(new Error("Stripe network error"))
        .mockResolvedValueOnce({
          id: "Y80OFF",
          times_redeemed: 0,
          max_redemptions: 200,
          valid: true,
          percent_off: 80,
        });
      const res = await makeRequest(
        "/billing/limited-offer",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { offers: unknown[] };
      expect(body.offers).toEqual([
        expect.objectContaining({ code: "Y80OFF", available: true }),
      ]);
      expect(mockCouponsRetrieve).toHaveBeenCalledTimes(2);
    });
  });
});
