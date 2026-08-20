import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Env } from "../../src/types/env.js";

// We build a minimal env for tests
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

const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();
const mockDbDelete = vi.fn();
const mockDbTransaction = vi.fn();
const mockCaptureEvent = vi.fn();
const mockCaptureException = vi.fn(() => "mock-event-id");

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    delete: mockDbDelete,
    transaction: mockDbTransaction,
  })),
}));

const mockConstructEventAsync = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();

const mockAddBreadcrumb = vi.fn();
vi.mock("@sentry/cloudflare", () => ({
  addBreadcrumb: mockAddBreadcrumb,
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setExtra: vi.fn() }),
  ),
  captureException: vi.fn(() => "mock-event-id"),
  withSentry: vi.fn((_, handler: unknown) => handler),
}));

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      webhooks: {
        constructEventAsync: mockConstructEventAsync,
      },
      subscriptions: {
        retrieve: mockSubscriptionsRetrieve,
      },
    };
  }
  StripeMock.createFetchHttpClient = () => null;
  return { default: StripeMock };
});

vi.mock("../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  })),
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
  captureException: mockCaptureException,
  buildInternalErrorBody: vi.fn((trackingId?: string) => ({
    error: "Something went wrong. Please try again.",
    ...(trackingId ? { trackingId } : {}),
  })),
}));

// Import the router after mocks are set up
const billingModule = await import("../../src/routes/billing.js");
const billingRouter = billingModule.default;

// Wrap the billing router so we can inject env bindings
function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", billingRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

/** Mock the event reservation to succeed for a new event. */
function mockNoExistingEvent() {
  const mockReturning = vi.fn().mockResolvedValue([{ eventId: "evt_new" }]);
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn(() => ({
    onConflictDoNothing: mockOnConflictDoNothing,
  }));
  mockDbInsert.mockReturnValueOnce({ values: mockValues });
}

/** Mock the event reservation to detect a duplicate event. */
function mockExistingEvent() {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn(() => ({
    onConflictDoNothing: mockOnConflictDoNothing,
  }));
  mockDbInsert.mockReturnValueOnce({ values: mockValues });
}

/** Mock a successful update chain: update().set().where() */
function mockUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  mockDbUpdate.mockReturnValueOnce({ set: mockSet });
  return { mockSet, mockWhere };
}

/** Mock a successful select chain for community lookup in subscription.updated */
function mockCommunityIdFromSubscription(
  communityId: string,
  tier = "starter",
  cycle: "monthly" | "annual" | null = "monthly",
) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ communityId, tier, cycle }]),
      })),
    })),
  });
}

/** Mock subscription lookup with previous billing tier for analytics. */
function mockSubscriptionRowFromStripeSubscription(
  communityId: string,
  tier = "starter",
  cycle: "monthly" | "annual" | null = "monthly",
) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ communityId, tier, cycle }]),
      })),
    })),
  });
}

/** Mock processedStripeEvents insert */
function mockInsertEvent() {
  return { mockValues: vi.fn() };
}

describe("POST /billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({
        select: mockDbSelect,
        update: mockDbUpdate,
        insert: mockDbInsert,
        delete: mockDbDelete,
      }),
    );
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await makeRequest(
      "/billing/webhook",
      { method: "POST", body: "payload" },
      mockEnv,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Missing signature" });
  });

  it("returns 400 when signature is invalid", async () => {
    mockConstructEventAsync.mockRejectedValueOnce(new Error("Bad signature"));
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "bad-sig" },
        body: "payload",
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid signature" });
  });

  it("returns received:true immediately for duplicate event (idempotency)", async () => {
    const fakeEvent = {
      id: "evt_dup",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_123", status: "canceled", current_period_end: 9999 },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    // Idempotency select returns existing event
    mockExistingEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    // No DB update should be called
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.deleted event and returns 200", async () => {
    const fakeEvent = {
      id: "evt_del",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          metadata: { userId: "u_delete" },
          status: "canceled",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockCommunityIdFromSubscription("comm_123", "growth", "annual");
    const { mockSet } = mockUpdateChain();
    const { mockSet: communitySet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" }),
    );
    expect(communitySet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: null }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "subscription_cancelled",
      {
        community_id: "comm_123",
        tier: "growth",
        billing_period: "annual",
        stripe_event_type: "customer.subscription.deleted",
        status: "canceled",
      },
      "u_delete",
      mockEnv,
    );
  });

  it("handles checkout.session.completed: fetches subscription, writes stripePriceId and correct status", async () => {
    const fakeEvent = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_abc",
          metadata: {
            communityId: "comm_123",
            tier: "growth",
            cycle: "monthly",
            userId: "u_checkout",
          },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    // Stripe subscription retrieve returns active status with price_starter
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_abc",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: {
        data: [{ price: { id: "price_starter" } }],
      },
    });

    // First update: subscriptions table
    const { mockSet: subSet } = mockUpdateChain();
    // Second update: communities table (stripePriceId)
    const { mockSet: commSet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    // Subscription updated with actual status (active) not hard-coded trialing
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_abc",
        status: "active",
        tier: "starter",
      }),
    );
    // stripePriceId written to communities
    expect(commSet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: "price_starter" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "checkout_completed",
      {
        community_id: "comm_123",
        tier: "starter",
        billing_period: "monthly",
        stripe_event_type: "checkout.session.completed",
        status: "active",
      },
      "u_checkout",
      mockEnv,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "billing_checkout_completed",
      {
        community_id: "comm_123",
        tier: "starter",
        billing_period: "monthly",
        stripe_event_type: "checkout.session.completed",
        status: "active",
      },
      "u_checkout",
      mockEnv,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "subscription_started",
      {
        community_id: "comm_123",
        tier: "starter",
        billing_period: "monthly",
        stripe_event_type: "checkout.session.completed",
        status: "active",
      },
      "u_checkout",
      mockEnv,
    );
  });

  it("handles checkout.session.completed with an opaque Stripe price ID from env config", async () => {
    const fakeEvent = {
      id: "evt_checkout_opaque_price",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_opaque_price",
          metadata: {
            communityId: "comm_opaque_price",
          },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    const envWithOpaquePrice: Env = {
      ...mockEnv,
      STRIPE_PRICE_GROWTH_ANNUAL: "price_1OpaqueGrowthAnnual",
    };

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_opaque_price",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: {
        data: [{ price: { id: "price_1OpaqueGrowthAnnual" } }],
      },
    });

    const { mockSet: subSet } = mockUpdateChain();
    const { mockSet: commSet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      envWithOpaquePrice,
    );

    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_opaque_price",
        status: "active",
        tier: "growth",
      }),
    );
    expect(commSet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: "price_growth" }),
    );
  });

  it("handles checkout.session.completed: trialing status preserved from Stripe", async () => {
    const fakeEvent = {
      id: "evt_trial",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_trial",
          metadata: { communityId: "comm_99" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_trial",
      status: "trialing",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: {
        data: [{ price: { id: "price_growth" } }],
      },
    });

    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain(); // communities
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trialing" }),
    );
  });

  it("persists checkout.session.completed trial timestamps from Stripe", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fakeEvent = {
      id: "evt_trial_dates_present",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_trial_dates_present",
          metadata: { communityId: "comm_101" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_trial_dates_present",
      status: "trialing",
      items: {
        data: [{ price: { id: "price_growth" } }],
      },
      current_period_end: nowSeconds + 86400,
      trial_start: nowSeconds,
      trial_end: nowSeconds + 30 * 86400,
    });

    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({
        trialStartedAt: expect.any(Date),
        trialEndsAt: expect.any(Date),
        currentPeriodEnd: expect.any(Date),
      }),
    );
  });

  it("handles checkout.session.completed when Stripe trial timestamps are absent", async () => {
    const fakeEvent = {
      id: "evt_trial_dates_absent",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_trial_dates_absent",
          metadata: { communityId: "comm_100" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_trial_dates_absent",
      status: "active",
      items: {
        data: [{ price: { id: "price_starter" } }],
      },
      current_period_end: undefined,
      trial_start: null,
      trial_end: null,
    });

    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({
        trialStartedAt: null,
        trialEndsAt: null,
        currentPeriodEnd: undefined,
      }),
    );
  });

  it("returns 200 (acknowledged) on checkout.session.completed when price ID maps to unknown tier — no tier mutation, error captured", async () => {
    const fakeEvent = {
      id: "evt_unknown_tier",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_unk",
          metadata: { communityId: "comm_123" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_unk",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: {
        data: [{ price: { id: "price_enterprise_bogus" } }],
      },
    });

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    // Unknown priceId must acknowledge (200) so Stripe stops retrying.
    // The subscription row must NOT be mutated.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    // No tier update written
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 (acknowledged) on customer.subscription.updated when price ID maps to unknown tier — no tier mutation, error captured", async () => {
    const fakeEvent = {
      id: "evt_sub_upd_unknown_price",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_unknown_price",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: {
            data: [{ price: { id: "price_totally_unknown_xyz" } }],
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    // Must return 200 (acknowledge) — not 500 — so Stripe stops retrying.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    // No DB update for the subscription row (tier must NOT be mutated)
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("does not record a Stripe event outside the billing mutation transaction when the mutation fails", async () => {
    const fakeEvent = {
      id: "evt_mutation_failure",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_mutation_failure",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: {
            data: [{ price: { id: "price_scale" } }],
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockCommunityIdFromSubscription("comm_mutation_failure");

    const mockWhere = vi.fn().mockRejectedValueOnce(new Error("db timeout"));
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockDbUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );

    expect(res.status).toBe(500);
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated event with stripePriceId and tier", async () => {
    const fakeEvent = {
      id: "evt_sub_upd",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          metadata: { userId: "u_upgrade" },
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: {
            data: [{ price: { id: "price_scale" } }],
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    // Community lookup from subscription
    mockSubscriptionRowFromStripeSubscription("comm_456", "growth");
    // communities update
    const { mockSet: commSet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", tier: "scale" }),
    );
    expect(commSet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: "price_scale" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "subscription_upgraded",
      {
        community_id: "comm_456",
        tier: "scale",
        previous_tier: "growth",
        billing_period: null,
        stripe_event_type: "customer.subscription.updated",
        status: "active",
      },
      "u_upgrade",
      mockEnv,
    );
  });

  it("handles customer.subscription.updated with an opaque Stripe price ID from env config", async () => {
    const fakeEvent = {
      id: "evt_sub_upd_opaque_price",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_opaque_updated",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: {
            data: [{ price: { id: "price_1OpaqueScaleMonthly" } }],
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_opaque_updated");
    const { mockSet: commSet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      {
        ...mockEnv,
        STRIPE_PRICE_SCALE_MONTHLY: "price_1OpaqueScaleMonthly",
      },
    );

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", tier: "scale" }),
    );
    expect(commSet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: "price_scale" }),
    );
  });

  it("clears stripePriceId when customer.subscription.updated moves to past_due", async () => {
    const fakeEvent = {
      id: "evt_sub_past_due_revoked",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_past_due_revoked",
          status: "past_due",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_scale" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockUpdateChain();
    mockCommunityIdFromSubscription("comm_past_due");
    const { mockSet: communitySet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(communitySet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: null }),
    );
  });

  it("returns 200 (acknowledged) on customer.subscription.updated with unknown tier — no tier mutation, error captured", async () => {
    const fakeEvent = {
      id: "evt_sub_bad_tier",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_bad",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: {
            data: [{ price: { id: "price_enterprise_unknown" } }],
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    // Unknown tier → acknowledge (200) to prevent Stripe retry storm; no tier mutation
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated with past_due status", async () => {
    const fakeEvent = {
      id: "evt_pd",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_pd",
          status: "past_due",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_starter" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_pd");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
  });

  it("handles customer.subscription.updated with canceled status", async () => {
    const fakeEvent = {
      id: "evt_can",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_canceled",
          status: "canceled",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_can");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" }),
    );
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "subscription_cancelled",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("handles customer.subscription.updated with trialing status", async () => {
    const fakeEvent = {
      id: "evt_trialing",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trialing",
          status: "trialing",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_portfolio" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_trialing");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trialing" }),
    );
  });

  it("persists customer.subscription.updated trial timestamps from Stripe", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fakeEvent = {
      id: "evt_updated_trial_dates_present",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trial_dates_present",
          status: "trialing",
          current_period_end: nowSeconds + 86400,
          trial_start: nowSeconds,
          trial_end: nowSeconds + 30 * 86400,
          items: { data: [{ price: { id: "price_starter" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_trial_dates");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        trialStartedAt: expect.any(Date),
        trialEndsAt: expect.any(Date),
        currentPeriodEnd: expect.any(Date),
      }),
    );
  });

  it("handles checkout.session.completed with no communityId in metadata returns received:true without DB update", async () => {
    const fakeEvent = {
      id: "evt_no_comm",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_xyz",
          metadata: {},
          customer_details: { email: "comm_from_email" },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    // Insert event for the "no communityId" early return
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated with non-standard status mapping to expired", async () => {
    const fakeEvent = {
      id: "evt_exp",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          status: "unpaid",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_starter" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_exp");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" }),
    );
  });

  it("handles invoice.payment_failed event (subscription via parent.subscription_details.subscription string)", async () => {
    const fakeEvent = {
      id: "evt_inv_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "inv_789",
          parent: {
            subscription_details: {
              subscription: "sub_789",
            },
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockCommunityIdFromSubscription("comm_789");
    const { mockSet } = mockUpdateChain();
    const { mockSet: communitySet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
    expect(communitySet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: null }),
    );
  });

  it("handles invoice.payment_failed event (subscription via parent.subscription_details.subscription object with id)", async () => {
    const fakeEvent = {
      id: "evt_inv_fail_obj",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "inv_790",
          parent: {
            subscription_details: {
              subscription: { id: "sub_790" },
            },
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockCommunityIdFromSubscription("comm_790");
    const { mockSet } = mockUpdateChain();
    const { mockSet: communitySet } = mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
    expect(communitySet).toHaveBeenCalledWith(
      expect.objectContaining({ stripePriceId: null }),
    );
  });

  it("invoice.payment_failed scopes its status update to open billing states (cannot resurrect a canceled/expired subscription)", async () => {
    // A late or out-of-order invoice.payment_failed (a distinct event, so the
    // processed-events guard does not dedupe it) must NOT flip a terminal
    // subscription (canceled/expired) back to past_due. The SET still targets
    // past_due, but the WHERE must carry a status predicate scoping to open
    // states so a terminal row matches zero rows. Mirrors the dues-webhook
    // payment_intent.payment_failed guard.
    const fakeEvent = {
      id: "evt_inv_fail_terminal_guard",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "inv_terminal",
          parent: {
            subscription_details: { subscription: "sub_terminal" },
          },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockCommunityIdFromSubscription("comm_terminal");
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockDbUpdate.mockReturnValueOnce({ set: mockSet });
    // community stripePriceId-clear update chain
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
    expect(mockWhere).toHaveBeenCalledOnce();
    // Render the where-clause to SQL: without the status guard it is a bare
    // `stripe_subscription_id = $1`; the guard adds a `status in (...)` predicate
    // so a terminal (canceled/expired) row matches zero rows.
    const whereArg = mockWhere.mock.calls[0]?.[0] as SQL;
    const renderedSql = new PgDialect().sqlToQuery(whereArg).sql;
    expect(renderedSql).toContain("status");
  });

  it("handles unknown event type gracefully", async () => {
    const fakeEvent = {
      id: "evt_unknown",
      type: "payment_intent.created",
      data: { object: {} },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it("handles checkout.session.completed with no subscription gracefully", async () => {
    const fakeEvent = {
      id: "evt_no_sub",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: null,
          metadata: { communityId: "comm_123" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("handles invoice.payment_failed with no parent/subscription gracefully", async () => {
    const fakeEvent = {
      id: "evt_inv_nosub",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "inv_no_sub",
          parent: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("handles checkout.session.completed: past_due status mapped correctly", async () => {
    const fakeEvent = {
      id: "evt_past_due_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_pd",
          metadata: { communityId: "comm_pd" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_pd",
      status: "past_due",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [{ price: { id: "price_starter" } }] },
    });
    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain(); // communities
    mockInsertEvent();
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "subscription_started",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("handles checkout.session.completed: canceled status mapped correctly", async () => {
    const fakeEvent = {
      id: "evt_canceled_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_can",
          metadata: { communityId: "comm_can" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_can",
      status: "canceled",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [{ price: { id: "price_starter" } }] },
    });
    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain(); // communities
    mockInsertEvent();
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("handles checkout.session.completed: non-standard status maps to expired", async () => {
    const fakeEvent = {
      id: "evt_exp_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_exp",
          metadata: { communityId: "comm_exp" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_exp",
      status: "unpaid",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [{ price: { id: "price_starter" } }] },
    });
    const { mockSet: subSet } = mockUpdateChain();
    mockUpdateChain(); // communities
    mockInsertEvent();
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(subSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" }),
    );
  });

  it("handles checkout.session.completed: returns 200 (acknowledged) when items data is empty (null priceId → unknown tier)", async () => {
    const fakeEvent = {
      id: "evt_empty_items",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_empty",
          metadata: { communityId: "comm_empty" },
          customer_details: null,
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_empty",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [] }, // empty → priceId becomes null via ?? null
    });
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    // null priceId → unknown tier → acknowledge (200) to prevent Stripe retry storm; no DB mutation
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("handles customer.subscription.updated: returns 200 (acknowledged) when items data is empty (null priceId → unknown tier)", async () => {
    const fakeEvent = {
      id: "evt_sub_empty_items",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_empty_items",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [] }, // empty → priceId becomes null via ?? null
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    // null priceId → unknown tier → acknowledge (200) to prevent Stripe retry storm; no DB mutation
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated returns 500 when subscription row is not found locally", async () => {
    const fakeEvent = {
      id: "evt_sub_noc",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_noc",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(500);
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated stores null trial dates when Stripe omits them", async () => {
    const fakeEvent = {
      id: "evt_sub_no_trial_dates",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_no_trial_dates",
          status: "active",
          current_period_end: undefined,
          trial_start: null,
          trial_end: null,
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();
    const { mockSet } = mockUpdateChain();
    mockCommunityIdFromSubscription("comm_growth");
    mockUpdateChain();
    mockInsertEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        trialStartedAt: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
      }),
    );
  });

  it("adds a Sentry breadcrumb (not an exception) for unhandled Stripe event types", async () => {
    vi.clearAllMocks();
    const fakeEvent = {
      id: "evt_unknown_type",
      type: "customer.created",
      data: { object: {} },
    };
    mockConstructEventAsync.mockResolvedValueOnce(fakeEvent);
    mockNoExistingEvent();

    const res = await makeRequest(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "valid-sig" },
        body: JSON.stringify(fakeEvent),
      },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);

    // Must add a breadcrumb, not an exception — keeps Sentry noise-free
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "stripe.webhook",
        level: "info",
        data: expect.objectContaining({
          eventType: "customer.created",
          eventId: "evt_unknown_type",
        }),
      }),
    );
  });
});
