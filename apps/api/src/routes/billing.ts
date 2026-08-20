import { Hono, type Context } from "hono";
import type Stripe from "stripe";
import * as Sentry from "@sentry/cloudflare";
import { zValidator } from "@hono/zod-validator";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  checkoutRequest,
  startTrialRequest,
  BillingCycle,
  priceIdToTier,
  TIER_VALUES,
  FULL_TRIAL_TIER,
  LIMITED_SUBSCRIPTION_PROMO,
  LIMITED_SUBSCRIPTION_OFFERS,
  TRIAL_DURATION_DAYS,
  getLimitedSubscriptionOffer,
  type Tier,
} from "@boardstack/shared";
import { createDb } from "../db/client.js";
import {
  subscriptions,
  communityMembers,
  processedStripeEvents,
} from "../db/schema/index.js";
import { communities } from "../db/schema/tenancy.js";
import type { Env } from "../types/env.js";
import { getAuth } from "../lib/auth.js";
import { createStripe } from "../lib/stripe-client.js";
import type { StripeClient } from "../lib/stripe-client.js";
import {
  buildInternalErrorBody,
  captureException,
  captureEvent,
} from "../lib/observability.js";
import { sendTrialStartedEmailForCommunity } from "../domain/billing/trialLifecycle.js";

const billingRouter = new Hono<{ Bindings: Env }>();

type LimitedOfferStatus = {
  cycle: "monthly" | "annual";
  code: string;
  couponId: string;
  terms: string;
  redeemed: number;
  limit: number;
  available: boolean;
};

type ActiveLimitedOffer = {
  id: string;
  shortLabel: string;
  offerLabel: string;
  badgeLabel: string;
  percentOff: number;
  totalRedemptionLimit: number;
  offers: LimitedOfferStatus[];
};

type OfferCache = { value: ActiveLimitedOffer | null; expiresAt: number };
let activeLimitedOfferCache: OfferCache | null = null;
const CACHE_TTL_MS = 60_000;

type BillingMetadata = {
  communityId: string;
  tier: Tier;
  cycle: "monthly" | "annual";
  userId: string;
};

export function resetActiveLaunchPhaseCache(): void {
  activeLimitedOfferCache = null;
}

async function getLimitedOfferStatus(
  cycle: "monthly" | "annual",
  stripe: StripeClient,
): Promise<LimitedOfferStatus | null> {
  const offer = getLimitedSubscriptionOffer(cycle);
  let coupon: Awaited<ReturnType<typeof stripe.coupons.retrieve>>;
  try {
    coupon = await stripe.coupons.retrieve(offer.stripeCouponId);
  } catch (err) {
    captureException(err as Error, {
      tags: { source: "billing", job: "limited-offer-coupon-retrieve" },
      extra: { cycle, code: offer.code, couponId: offer.stripeCouponId },
    });
    return null;
  }

  const limit = coupon.max_redemptions ?? offer.redemptionLimit;
  return {
    cycle,
    code: offer.code,
    couponId: offer.stripeCouponId,
    terms: offer.terms,
    redeemed: coupon.times_redeemed,
    limit,
    available: coupon.times_redeemed < limit,
  };
}

async function getActiveLimitedOffer(
  stripe: StripeClient,
): Promise<ActiveLimitedOffer | null> {
  const now = Date.now();
  if (activeLimitedOfferCache && now < activeLimitedOfferCache.expiresAt) {
    return activeLimitedOfferCache.value;
  }

  const offers = (
    await Promise.all(
      LIMITED_SUBSCRIPTION_OFFERS.map((offer) =>
        getLimitedOfferStatus(offer.cycle, stripe),
      ),
    )
  ).filter((offer): offer is LimitedOfferStatus => offer !== null);

  const active = offers.some((offer) => offer.available)
    ? {
        id: LIMITED_SUBSCRIPTION_PROMO.id,
        shortLabel: LIMITED_SUBSCRIPTION_PROMO.shortLabel,
        offerLabel: LIMITED_SUBSCRIPTION_PROMO.offerLabel,
        badgeLabel: LIMITED_SUBSCRIPTION_PROMO.badgeLabel,
        percentOff: LIMITED_SUBSCRIPTION_PROMO.percentOff,
        totalRedemptionLimit: LIMITED_SUBSCRIPTION_PROMO.totalRedemptionLimit,
        offers,
      }
    : null;

  activeLimitedOfferCache = { value: active, expiresAt: now + CACHE_TTL_MS };
  return active;
}

async function getLimitedSubscriptionOfferDiscount(
  cycle: "monthly" | "annual",
  stripe: StripeClient,
): Promise<[{ coupon: string }] | null> {
  const offer = await getLimitedOfferStatus(cycle, stripe);
  if (!offer?.available) return null;
  return [{ coupon: offer.couponId }];
}

function serializePublicLimitedOffer(offer: ActiveLimitedOffer) {
  return {
    id: offer.id,
    shortLabel: offer.shortLabel,
    offerLabel: offer.offerLabel,
    badgeLabel: offer.badgeLabel,
    percentOff: offer.percentOff,
    offers: offer.offers.map(({ cycle, code, terms, available }) => ({
      cycle,
      code,
      terms,
      available,
    })),
  };
}

/**
 * Stripe SDK v22 removed `current_period_end` from the TypeScript type for
 * `Stripe.Subscription`, but the field is still present in webhook payloads
 * and subscription.retrieve responses. This type makes the runtime shape
 * explicit so the codebase avoids ad-hoc `unknown` casts.
 */
type StripeSubscriptionWithPeriodEnd = Stripe.Subscription & {
  current_period_end?: number;
  trial_start?: number | null;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
};

type BillingWebhookAnalyticsEvent = {
  name:
    | "checkout_completed"
    | "billing_checkout_completed"
    | "subscription_started"
    | "subscription_upgraded"
    | "subscription_cancelled";
  properties: Record<string, unknown>;
  distinctId: string;
};

function getPriceId(env: Env, tier: string, cycle: string): string {
  const key =
    `STRIPE_PRICE_${tier.toUpperCase()}_${cycle.toUpperCase()}` as keyof Env;
  const id = env[key] as string | undefined;
  if (!id) throw new Error(`Missing env var: ${key}`);
  return id;
}

export function isTrustedBillingUrl(env: Env, url: string): boolean {
  try {
    const parsed = new URL(url);
    const appOrigin = new URL(env.APP_URL).origin;
    if (parsed.origin === appOrigin) {
      return true;
    }

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(appOrigin)) {
      return parsed.origin === "http://localhost:3060";
    }

    return false;
  } catch {
    return false;
  }
}

function priceKeyFor(tier: Tier, cycle: "monthly" | "annual"): keyof Env {
  return `STRIPE_PRICE_${tier.toUpperCase()}_${cycle.toUpperCase()}` as keyof Env;
}

export function resolveTierFromPriceId(
  env: Env,
  priceId: string | null | undefined,
  fallbackTier?: string | null,
): Tier | null {
  const directMatch = priceIdToTier(priceId);
  if (directMatch) {
    return directMatch;
  }

  if (priceId) {
    for (const tier of TIER_VALUES) {
      for (const cycle of ["monthly", "annual"] as const) {
        if (env[priceKeyFor(tier, cycle)] === priceId) {
          return tier;
        }
      }
    }
  }

  if (fallbackTier && TIER_VALUES.includes(fallbackTier as Tier)) {
    return fallbackTier as Tier;
  }

  return null;
}

export function resolveCycleFromPriceId(
  env: Env,
  priceId: string | null | undefined,
  fallbackCycle?: string | null,
): "monthly" | "annual" | null {
  if (priceId) {
    for (const tier of TIER_VALUES) {
      for (const cycle of BillingCycle.options) {
        if (env[priceKeyFor(tier, cycle)] === priceId) {
          return cycle;
        }
      }
    }
  }

  if (fallbackCycle === "monthly" || fallbackCycle === "annual") {
    return fallbackCycle;
  }

  return null;
}

function communityTierMarker(tier: Tier): string {
  return `price_${tier}`;
}

function communityDistinctId(communityId: string): string {
  return `community:${communityId}`;
}

function billingWebhookDistinctId(
  communityId: string,
  userId: string | null | undefined,
): string {
  return userId ?? communityDistinctId(communityId);
}

function isHigherTier(nextTier: Tier, previousTier: string | null | undefined) {
  if (!previousTier || !TIER_VALUES.includes(previousTier as Tier)) {
    return false;
  }

  return (
    TIER_VALUES.indexOf(nextTier) > TIER_VALUES.indexOf(previousTier as Tier)
  );
}

function mapStripeStatus(
  status: string,
): "trialing" | "active" | "past_due" | "canceled" | "expired" {
  return status === "trialing"
    ? "trialing"
    : status === "active"
      ? "active"
      : status === "past_due"
        ? "past_due"
        : status === "canceled"
          ? "canceled"
          : "expired";
}

export function normalizeSubscriptionStatus(sub: {
  status: string;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
}):
  | "pending_trial"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired" {
  if (
    sub.status === "trialing" &&
    sub.stripeSubscriptionId === null &&
    sub.trialEndsAt !== null &&
    sub.trialEndsAt.getTime() <= Date.now()
  ) {
    return "expired";
  }

  return sub.status as
    | "pending_trial"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "expired";
}

function serializeBillingStatus(sub: {
  status: string;
  stripeSubscriptionId?: string | null;
  tier: string;
  cycle: string | null;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  return {
    status: normalizeSubscriptionStatus({
      status: sub.status,
      stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
      trialEndsAt: sub.trialEndsAt ?? null,
    }),
    tier: sub.tier,
    cycle: sub.cycle,
    trialStartedAt: sub.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

async function getLimitedOfferResponse(c: Context<{ Bindings: Env }>) {
  const stripe = createStripe(c.env);
  const offer = await getActiveLimitedOffer(stripe);
  if (!offer) {
    return c.json({ error: "No active limited offer" }, 404);
  }
  c.header("Cache-Control", "public, max-age=60");
  return c.json(serializePublicLimitedOffer(offer));
}

billingRouter.get("/billing/limited-offer", getLimitedOfferResponse);

billingRouter.get("/billing/status", async (c) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "Missing communityId" }, 400);

  const db = createDb(c.env);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!membership) return c.json({ error: "Forbidden" }, 403);

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.communityId, communityId))
    .limit(1);
  if (!sub) return c.json({ error: "Not found" }, 404);
  const normalizedStatus = normalizeSubscriptionStatus(sub);

  return c.json({
    ...serializeBillingStatus(sub),
    status: normalizedStatus,
  });
});

billingRouter.post(
  "/billing/start-trial",
  zValidator("json", startTrialRequest),
  async (c) => {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");
    const db = createDb(c.env);

    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, data.communityId),
          eq(communityMembers.userId, session.user.id),
          inArray(communityMembers.role, ["owner", "admin"]),
        ),
      )
      .limit(1);
    if (!membership) return c.json({ error: "Forbidden" }, 403);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.communityId, data.communityId))
      .limit(1);
    if (!sub) return c.json({ error: "Community not found" }, 404);
    if (sub.status === "trialing" || sub.status === "active") {
      return c.json(serializeBillingStatus(sub));
    }
    if (sub.status !== "pending_trial") {
      return c.json(
        {
          error: "A free trial can only be started once per community",
        },
        409,
      );
    }

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(
      trialStartedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );

    await db
      .update(subscriptions)
      .set({
        tier: FULL_TRIAL_TIER,
        cycle: null,
        status: "trialing",
        cancelAtPeriodEnd: false,
        trialStartedAt,
        trialEndsAt,
        currentPeriodEnd: null,
        stripeSubscriptionId: null,
        trialStartedEmailSentAt: null,
        trialEndingReminderSentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.communityId, data.communityId));

    try {
      await sendTrialStartedEmailForCommunity(c.env, data.communityId);
    } catch (error) {
      captureException(error, {
        tags: { source: "billing", job: "trial-started-email" },
        extra: { communityId: data.communityId },
      });
    }

    await captureEvent(
      "trial_started",
      {
        community_id: data.communityId,
        tier: FULL_TRIAL_TIER,
        billing_period: null,
      },
      session.user.id,
      c.env,
    );

    return c.json({
      status: "trialing" as const,
      tier: FULL_TRIAL_TIER,
      cycle: null,
      trialStartedAt: trialStartedAt.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  },
);

billingRouter.post(
  "/billing/checkout",
  zValidator("json", checkoutRequest),
  async (c) => {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const data = c.req.valid("json");
    if (
      !isTrustedBillingUrl(c.env, data.successUrl) ||
      !isTrustedBillingUrl(c.env, data.cancelUrl)
    ) {
      return c.json({ error: "Invalid billing return URL" }, 400);
    }
    const db = createDb(c.env);

    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, data.communityId),
          eq(communityMembers.userId, session.user.id),
          inArray(communityMembers.role, ["owner", "admin"]),
        ),
      )
      .limit(1);
    if (!membership) return c.json({ error: "Forbidden" }, 403);

    const stripe = createStripe(c.env);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.communityId, data.communityId))
      .limit(1);
    if (!sub) return c.json({ error: "Community not found" }, 404);
    const normalizedStatus = normalizeSubscriptionStatus(sub);
    const hasElapsedLocalTrial =
      sub.status === "trialing" && normalizedStatus === "expired";

    if (normalizedStatus !== "trialing" && normalizedStatus !== "expired") {
      return c.json(
        {
          error:
            "Checkout is only available for active trials or restarting after expiry",
        },
        409,
      );
    }

    if (hasElapsedLocalTrial) {
      await db
        .update(subscriptions)
        .set({
          status: "expired",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.communityId, data.communityId));
    }

    const cycle = data.cycle;
    const billingMetadata: BillingMetadata = {
      communityId: data.communityId,
      tier: data.tier,
      cycle,
      userId: session.user.id,
    };
    const subscriptionData: {
      trial_end?: number;
      trial_period_days?: number;
      metadata: BillingMetadata;
    } = { metadata: billingMetadata };
    if (normalizedStatus === "trialing" && sub.trialEndsAt) {
      subscriptionData.trial_end = Math.floor(sub.trialEndsAt.getTime() / 1000);
    }

    const limitedOfferDiscounts = await getLimitedSubscriptionOfferDiscount(
      cycle,
      stripe,
    );

    const priceId = getPriceId(c.env, data.tier, cycle);
    const price = await stripe.prices.retrieve(priceId);
    if (price.currency.toLowerCase() !== "usd") {
      const trackingId = captureException(
        new Error(
          `Stripe price ${priceId} uses ${price.currency}; Gavelhouse checkout requires USD`,
        ),
        {
          tags: { source: "billing", job: "checkout-price-currency" },
          extra: { communityId: data.communityId, tier: data.tier, cycle },
        },
      );
      return c.json(buildInternalErrorBody(trackingId), 500);
    }

    // Upsert Stripe customer
    let customerId = sub.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: session.user.email,
          name: session.user.name ?? undefined,
          metadata: { communityId: data.communityId },
        },
        { idempotencyKey: `community-${data.communityId}-customer` },
      );
      customerId = customer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(limitedOfferDiscounts ? { discounts: limitedOfferDiscounts } : {}),
      subscription_data: subscriptionData,
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      metadata: {
        ...billingMetadata,
      },
    });

    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customerId,
        tier: data.tier,
        cycle,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.communityId, data.communityId));

    await captureEvent(
      "billing_checkout_started",
      {
        community_id: data.communityId,
        tier: data.tier,
        billing_period: cycle,
      },
      session.user.id,
      c.env,
    );
    await captureEvent(
      "checkout_started",
      {
        community_id: data.communityId,
        tier: data.tier,
        billing_period: cycle,
      },
      session.user.id,
      c.env,
    );

    return c.json({ url: checkoutSession.url });
  },
);

const portalRequest = z.object({
  communityId: z.string().min(1),
  returnUrl: z.string().url(),
});

billingRouter.post(
  "/billing/portal",
  zValidator("json", portalRequest),
  async (c) => {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const { communityId, returnUrl } = c.req.valid("json");
    if (!isTrustedBillingUrl(c.env, returnUrl)) {
      return c.json({ error: "Invalid billing return URL" }, 400);
    }
    const db = createDb(c.env);

    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, session.user.id),
          inArray(communityMembers.role, ["owner", "admin"]),
        ),
      )
      .limit(1);
    if (!membership) return c.json({ error: "Forbidden" }, 403);

    const stripe = createStripe(c.env);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.communityId, communityId))
      .limit(1);
    if (!sub?.stripeCustomerId)
      return c.json({ error: "No billing setup" }, 404);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });
    return c.json({ url: portalSession.url });
  },
);

// Raw body for webhook signature verification
billingRouter.post("/billing/webhook", async (c) => {
  const stripe = createStripe(c.env);
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);

  const body = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = createDb(c.env);
  let trialStartedCommunityId: string | null = null;
  const analyticsEvents: BillingWebhookAnalyticsEvent[] = [];

  const processed = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(processedStripeEvents)
      .values({ eventId: event.id })
      .onConflictDoNothing()
      .returning({ eventId: processedStripeEvents.eventId });
    if (inserted.length === 0) {
      return false;
    }

    if (event.type === "checkout.session.completed") {
      const sess = event.data.object as Stripe.Checkout.Session;
      const communityId = sess.metadata?.["communityId"];
      if (!communityId) {
        return true;
      }
      if (sess.subscription) {
        const subscriptionId = sess.subscription as string;
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        const rawSub = stripeSub as unknown as StripeSubscriptionWithPeriodEnd;
        const priceId = stripeSub.items.data[0]?.price?.id ?? null;
        const tier = resolveTierFromPriceId(
          c.env,
          priceId,
          sess.metadata?.["tier"] ?? null,
        );
        const cycle = resolveCycleFromPriceId(
          c.env,
          priceId,
          sess.metadata?.["cycle"] ?? null,
        );
        if (tier === null) {
          // Unknown price ID — log via Sentry and acknowledge so Stripe stops
          // retrying. Do NOT write a bad/null tier to the subscription row.
          captureException(
            new Error(
              `Unknown tier for price ID "${priceId}" on checkout.session.completed (event ${event.id})`,
            ),
            {
              tags: {
                source: "billing-webhook",
                job: "checkout-session-completed",
              },
              extra: { priceId, eventId: event.id },
            },
          );
          return true; // acknowledge event; outer code returns { received: true }
        }
        const subStatus = mapStripeStatus(stripeSub.status);
        const trialStartedAt = rawSub.trial_start
          ? new Date(rawSub.trial_start * 1000)
          : null;
        const trialEndsAt = rawSub.trial_end
          ? new Date(rawSub.trial_end * 1000)
          : null;

        await tx
          .update(subscriptions)
          .set({
            stripeSubscriptionId: subscriptionId,
            status: subStatus,
            tier,
            cycle,
            cancelAtPeriodEnd: rawSub.cancel_at_period_end ?? false,
            trialStartedAt,
            trialEndsAt,
            updatedAt: new Date(),
            currentPeriodEnd: rawSub.current_period_end
              ? new Date(rawSub.current_period_end * 1000)
              : undefined,
          })
          .where(eq(subscriptions.communityId, communityId));

        await tx
          .update(communities)
          .set({
            stripePriceId:
              subStatus === "active" || subStatus === "trialing"
                ? communityTierMarker(tier)
                : null,
            updatedAt: new Date(),
          })
          .where(eq(communities.id, communityId));

        const userId =
          typeof sess.metadata?.["userId"] === "string"
            ? sess.metadata["userId"]
            : undefined;
        const distinctId = billingWebhookDistinctId(communityId, userId);
        const baseProperties = {
          community_id: communityId,
          tier,
          billing_period: cycle,
          stripe_event_type: event.type,
          status: subStatus,
        };
        analyticsEvents.push(
          {
            name: "checkout_completed",
            properties: baseProperties,
            distinctId,
          },
          {
            name: "billing_checkout_completed",
            properties: baseProperties,
            distinctId,
          },
        );
        if (subStatus === "active" || subStatus === "trialing") {
          analyticsEvents.push({
            name: "subscription_started",
            properties: baseProperties,
            distinctId,
          });
        }

        trialStartedCommunityId = communityId;
      }
    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as StripeSubscriptionWithPeriodEnd;
      const priceId = sub.items.data[0]?.price?.id ?? null;
      const tier = resolveTierFromPriceId(c.env, priceId);
      const cycle = resolveCycleFromPriceId(c.env, priceId);
      if (tier === null) {
        // Unknown price ID — log via Sentry and acknowledge so Stripe stops
        // retrying. Do NOT write a bad/null tier to the subscription row.
        captureException(
          new Error(
            `Unknown tier for price ID "${priceId}" on customer.subscription.updated (event ${event.id})`,
          ),
          {
            tags: { source: "billing-webhook", job: "subscription-updated" },
            extra: { priceId, eventId: event.id, subscriptionId: sub.id },
          },
        );
        return true; // acknowledge event; outer code returns { received: true }
      }
      const status = mapStripeStatus(sub.status);
      const [subRow] = await tx
        .select({
          communityId: subscriptions.communityId,
          tier: subscriptions.tier,
        })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        .limit(1);
      if (!subRow) {
        throw new Error(
          `Subscription row not found for Stripe subscription "${sub.id}" (event ${event.id})`,
        );
      }
      await tx
        .update(subscriptions)
        .set({
          status,
          tier,
          cycle,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          trialStartedAt: sub.trial_start
            ? new Date(sub.trial_start * 1000)
            : null,
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      await tx
        .update(communities)
        .set({
          stripePriceId:
            status === "active" || status === "trialing"
              ? communityTierMarker(tier)
              : null,
          updatedAt: new Date(),
        })
        .where(eq(communities.id, subRow.communityId));

      const baseProperties = {
        community_id: subRow.communityId,
        tier,
        billing_period: cycle,
        stripe_event_type: event.type,
        status,
      };
      const distinctId = billingWebhookDistinctId(
        subRow.communityId,
        sub.metadata?.["userId"],
      );
      if (
        (status === "active" || status === "trialing") &&
        isHigherTier(tier, subRow.tier)
      ) {
        analyticsEvents.push({
          name: "subscription_upgraded",
          properties: {
            ...baseProperties,
            previous_tier: subRow.tier,
          },
          distinctId,
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const [subRow] = await tx
        .select({
          communityId: subscriptions.communityId,
          tier: subscriptions.tier,
          cycle: subscriptions.cycle,
        })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        .limit(1);
      await tx
        .update(subscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      if (subRow) {
        await tx
          .update(communities)
          .set({ stripePriceId: null, updatedAt: new Date() })
          .where(eq(communities.id, subRow.communityId));
        analyticsEvents.push({
          name: "subscription_cancelled",
          properties: {
            community_id: subRow.communityId,
            tier: subRow.tier,
            billing_period: subRow.cycle,
            stripe_event_type: event.type,
            status: "canceled",
          },
          distinctId: billingWebhookDistinctId(
            subRow.communityId,
            sub.metadata?.["userId"],
          ),
        });
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const rawSubscription =
        invoice.parent?.subscription_details?.subscription ?? null;
      const subscriptionId =
        typeof rawSubscription === "string"
          ? rawSubscription
          : (rawSubscription?.id ?? null);
      if (subscriptionId) {
        const [subRow] = await tx
          .select({ communityId: subscriptions.communityId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
          .limit(1);
        // Scope the flip to open billing states. A late or out-of-order
        // invoice.payment_failed (a distinct event, so the processed-events
        // guard does not dedupe it) must NOT resurrect a terminal subscription
        // (canceled/expired) back to past_due. Mirrors the status-scoped guard
        // the dues webhook uses on payment_intent.payment_failed.
        await tx
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(
            and(
              eq(subscriptions.stripeSubscriptionId, subscriptionId),
              inArray(subscriptions.status, [
                "trialing",
                "active",
                "past_due",
                "pending_trial",
              ]),
            ),
          );
        if (subRow) {
          await tx
            .update(communities)
            .set({ stripePriceId: null, updatedAt: new Date() })
            .where(eq(communities.id, subRow.communityId));
        }
      }
    } else {
      // Unhandled Stripe event type — log for observability but return 200 so
      // Stripe does not keep retrying the delivery. A breadcrumb is added for
      // dashboard filtering without generating noise-level exception alerts.
      console.info("[stripe-webhook] unhandled event", {
        eventType: event.type,
        eventId: event.id,
      });
      Sentry.addBreadcrumb({
        category: "stripe.webhook",
        message: `Unhandled Stripe event type: ${event.type}`,
        level: "info",
        data: { eventType: event.type, eventId: event.id },
      });
    }

    return true;
  });
  if (!processed) {
    return c.json({ received: true });
  }

  for (const analyticsEvent of analyticsEvents) {
    await captureEvent(
      analyticsEvent.name,
      analyticsEvent.properties,
      analyticsEvent.distinctId,
      c.env,
    );
  }

  if (trialStartedCommunityId) {
    try {
      await sendTrialStartedEmailForCommunity(c.env, trialStartedCommunityId);
    } catch (error) {
      captureException(error, {
        tags: { source: "billing", job: "trial-started-email" },
        extra: { communityId: trialStartedCommunityId },
      });
    }
  }

  return c.json({ received: true });
});

export default billingRouter;
