import { describe, it, expect } from "vitest";
import { createStripe } from "../../src/lib/stripe-client.js";
import type { Env } from "../../src/types/env.js";

const baseEnv: Env = {
  STRIPE_SECRET_KEY: "sk_test_DUMMY",
  STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  STRIPE_PRICE_STARTER_MONTHLY: "price_sm",
  STRIPE_PRICE_STARTER_ANNUAL: "price_sa",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_gm",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_ga",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scm",
  STRIPE_PRICE_SCALE_ANNUAL: "price_sca",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_pm",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_pa",
  BETTER_AUTH_SECRET: "secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  RESEND_API_KEY: "re_dummy",
};

describe("createStripe — mock mode (sk_test_DUMMY)", () => {
  const stripe = createStripe(baseEnv);

  it("customers.create returns mock customer id", async () => {
    const result = await stripe.customers.create({
      email: "test@example.com",
      name: "Test User",
      metadata: { communityId: "comm-001" },
    });
    expect(result).toEqual({ id: "cus_mock_001" });
  });

  it("checkout.sessions.create returns mock checkout URL", async () => {
    const result = await stripe.checkout.sessions.create({
      customer: "cus_mock_001",
      mode: "subscription",
      line_items: [{ price: "price_sm", quantity: 1 }],
      success_url: "http://localhost:3060/success",
      cancel_url: "http://localhost:3060/cancel",
      metadata: { communityId: "comm-001", tier: "starter", cycle: "monthly" },
    });
    expect(result).toEqual({
      url: "http://localhost:3060/billing?mock_checkout=1",
    });
  });

  it("billingPortal.sessions.create returns mock portal URL", async () => {
    const result = await stripe.billingPortal.sessions.create({
      customer: "cus_mock_001",
      return_url: "http://localhost:3060/billing",
    });
    expect(result).toEqual({
      url: "http://localhost:3060/billing?mock_portal=1",
    });
  });

  it("prices.retrieve returns a mock USD price", async () => {
    const result = await stripe.prices.retrieve("price_sm");
    expect(result).toEqual({ currency: "usd" });
  });

  it("subscriptions.update returns cancel_at_period_end true", async () => {
    const result = await stripe.subscriptions.update("sub_mock_001", {
      cancel_at_period_end: true,
    });
    expect(result).toEqual({
      id: "sub_mock_001",
      cancel_at_period_end: true,
    });
  });

  it("subscriptions.retrieve returns mock subscription with active status", async () => {
    const result = await stripe.subscriptions.retrieve("sub_mock_002", {
      expand: ["items.data.price"],
    });
    expect(result.id).toBe("sub_mock_002");
    expect(result.status).toBe("active");
    expect(Array.isArray(result.items.data)).toBe(true);
    expect(result.items.data[0].price.id).toBe("price_mock");
  });

  it("paymentIntents.create returns mock payment intent", async () => {
    const result = await stripe.paymentIntents.create({
      amount: 15000,
      currency: "usd",
      customer: "cus_mock_001",
      metadata: { communityId: "comm-001" },
    });
    expect(result).toEqual({
      id: "pi_mock_001",
      client_secret: "pi_mock_secret",
    });
  });

  it("paymentIntents.retrieve returns mock payment intent", async () => {
    const result = await stripe.paymentIntents.retrieve("pi_abc123");
    expect(result).toEqual({
      id: "pi_abc123",
      client_secret: "pi_mock_secret",
    });
  });

  it("paymentIntents.cancel returns a canceled mock payment intent", async () => {
    const result = await stripe.paymentIntents.cancel("pi_abc123");
    expect(result).toEqual({ id: "pi_abc123", status: "canceled" });
  });

  it("webhooks.constructEventAsync throws (rejects unsigned requests)", async () => {
    await expect(
      stripe.webhooks.constructEventAsync("body", "sig", "secret"),
    ).rejects.toThrow();
  });

  it("coupons.retrieve returns a mock coupon with given id", async () => {
    const result = await stripe.coupons.retrieve("Y80OFF");
    expect(result).toEqual({
      id: "Y80OFF",
      times_redeemed: 0,
      max_redemptions: 100,
      valid: true,
      percent_off: null,
    });
  });
});

describe("createStripe production safeguards", () => {
  it("rejects the local mock key in production", () => {
    expect(() =>
      createStripe({
        ...baseEnv,
        SENTRY_ENVIRONMENT: "production",
      }),
    ).toThrow("STRIPE_SECRET_KEY is set to the local mock key in production.");
  });
});

describe("createStripe — real mode (non-DUMMY key)", () => {
  it("returns a Stripe-compatible instance (not the mock)", () => {
    const realEnv: Env = {
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_realkey123",
    };
    const stripe = createStripe(realEnv);

    // The real Stripe instance has these namespaces as objects
    expect(typeof stripe.customers).toBe("object");
    expect(typeof stripe.checkout).toBe("object");
    expect(typeof stripe.billingPortal).toBe("object");
    expect(typeof stripe.subscriptions).toBe("object");
    expect(typeof stripe.webhooks).toBe("object");

    // The real instance must have the actual methods
    expect(typeof stripe.customers.create).toBe("function");
    expect(typeof stripe.checkout.sessions.create).toBe("function");
    expect(typeof stripe.billingPortal.sessions.create).toBe("function");
    expect(typeof stripe.subscriptions.update).toBe("function");
    expect(typeof stripe.subscriptions.retrieve).toBe("function");
    expect(typeof stripe.webhooks.constructEventAsync).toBe("function");
  });

  it("real instance is not the mock (customers.create is not the stub)", async () => {
    const realEnv: Env = {
      ...baseEnv,
      STRIPE_SECRET_KEY: "sk_test_realkey123",
    };
    const stripe = createStripe(realEnv);

    // The mock customers.create always resolves to { id: 'cus_mock_001' }
    // The real one is a different function — we verify by source (function.toString won't
    // contain the literal mock id) without making real HTTP calls.
    const fnSource = stripe.customers.create.toString();
    expect(fnSource).not.toContain("cus_mock_001");
  });
});
