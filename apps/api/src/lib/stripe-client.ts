import Stripe from "stripe";
import type { Env } from "../types/env.js";

export interface StripeClient {
  customers: {
    create: (
      params: {
        email?: string;
        name?: string;
        metadata?: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create: (
        params: {
          customer?: string;
          mode: string;
          line_items?: Array<{
            price?: string;
            quantity: number;
            price_data?: {
              currency: string;
              product_data: { name: string };
              unit_amount: number;
            };
          }>;
          payment_method_collection?: "always" | "if_required";
          payment_intent_data?: {
            metadata?: Record<string, string>;
          };
          subscription_data?: {
            trial_end?: number;
            trial_period_days?: number;
          };
          discounts?: Array<{ coupon: string }>;
          success_url: string;
          cancel_url: string;
          metadata?: Record<string, string>;
        },
        options?: { idempotencyKey?: string },
      ) => Promise<{ url: string | null }>;
    };
  };
  prices: {
    retrieve: (id: string) => Promise<{ currency: string }>;
  };
  billingPortal: {
    sessions: {
      create: (params: {
        customer: string;
        return_url: string;
      }) => Promise<{ url: string }>;
    };
  };
  subscriptions: {
    update: (
      id: string,
      params: { cancel_at_period_end: boolean },
    ) => Promise<{ id: string; cancel_at_period_end: boolean }>;
    retrieve: (
      id: string,
      params?: { expand?: string[] },
    ) => Promise<{
      id: string;
      status: string;
      trial_start?: number | null;
      trial_end?: number | null;
      current_period_end?: number;
      items: {
        data: Array<{
          price: { id: string };
        }>;
      };
    }>;
  };
  paymentIntents: {
    create: (params: {
      amount: number;
      currency: string;
      customer?: string;
      metadata?: Record<string, string>;
    }) => Promise<{ id: string; client_secret: string | null }>;
    retrieve: (id: string) => Promise<{
      id: string;
      client_secret: string | null;
    }>;
    cancel: (id: string) => Promise<{ id: string; status: string }>;
  };
  webhooks: {
    constructEventAsync: (
      body: string,
      sig: string,
      secret: string,
    ) => Promise<Stripe.Event>;
  };
  coupons: {
    retrieve: (id: string) => Promise<{
      id: string;
      times_redeemed: number;
      max_redemptions: number | null;
      valid: boolean;
      percent_off: number | null;
    }>;
  };
}

const MOCK_KEY = "sk_test_DUMMY";

function isProduction(env: Env): boolean {
  return env.SENTRY_ENVIRONMENT === "production";
}

function createMock(): StripeClient {
  return {
    customers: {
      create: async () => ({ id: "cus_mock_001" }),
    },
    checkout: {
      sessions: {
        create: async () => ({
          url: "http://localhost:3060/billing?mock_checkout=1",
        }),
      },
    },
    prices: {
      retrieve: async () => ({ currency: "usd" }),
    },
    billingPortal: {
      sessions: {
        create: async () => ({
          url: "http://localhost:3060/billing?mock_portal=1",
        }),
      },
    },
    subscriptions: {
      update: async (id) => ({ id, cancel_at_period_end: true }),
      retrieve: async (id) => ({
        id,
        status: "active",
        items: { data: [{ price: { id: "price_mock" } }] },
      }),
    },
    paymentIntents: {
      create: async () => ({
        id: "pi_mock_001",
        client_secret: "pi_mock_secret",
      }),
      retrieve: async (id) => ({ id, client_secret: "pi_mock_secret" }),
      cancel: async (id) => ({ id, status: "canceled" }),
    },
    webhooks: {
      constructEventAsync: async () => {
        throw new Error(
          "Stripe webhook signature verification not available in mock mode",
        );
      },
    },
    coupons: {
      retrieve: async (id) => ({
        id,
        times_redeemed: 0,
        max_redemptions: 100,
        valid: true,
        percent_off: null,
      }),
    },
  };
}

export function createStripe(env: Env): StripeClient {
  if (env.STRIPE_SECRET_KEY === MOCK_KEY) {
    if (isProduction(env)) {
      throw new Error(
        "STRIPE_SECRET_KEY is set to the local mock key in production.",
      );
    }
    return createMock();
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripe as unknown as StripeClient;
}
