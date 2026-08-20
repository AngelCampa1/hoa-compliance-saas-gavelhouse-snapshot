import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, inArray } from "drizzle-orm";
import { CancelReasonInput } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  communityMembers,
  subscriptions,
  churnReasons,
} from "../../db/schema/index.js";
import { nanoid } from "../../lib/nanoid.js";
import { getAuth } from "../../lib/auth.js";
import { createStripe } from "../../lib/stripe-client.js";
import type { Env } from "../../types/env.js";
import { captureEvent } from "../../lib/observability.js";

const cancelRouter = new Hono<{ Bindings: Env }>();

cancelRouter.post(
  "/billing/cancel",
  zValidator("json", CancelReasonInput),
  async (c) => {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const { communityId, reason, note } = c.req.valid("json");
    const db = createDb(c.env);

    // requireWriteMembership: only owner/admin can cancel
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

    // Fetch subscription to get stripeSubscriptionId and tier
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.communityId, communityId))
      .limit(1);

    // A subscription row with a Stripe subscription ID is required to cancel.
    // If no row exists or the subscription was never activated in Stripe (e.g. a
    // trial that elapsed to "expired" without upgrading), there is nothing to
    // cancel — return 404 so the caller knows no action was taken, rather than a
    // misleading { cancelAtPeriodEnd: true } success. This must run before the
    // terminal-status check below so an expired/canceled trial with no Stripe
    // subscription is not reported as a scheduled cancellation.
    if (!sub?.stripeSubscriptionId) {
      return c.json({ error: "No active subscription found" }, 404);
    }

    // An already-terminal subscription (canceled/expired in Stripe) needs no
    // further action — report success idempotently without touching Stripe.
    if (sub.status === "canceled" || sub.status === "expired") {
      return c.json({ ok: true, cancelAtPeriodEnd: true });
    }

    if (sub.cancelAtPeriodEnd) {
      return c.json({ ok: true, cancelAtPeriodEnd: true });
    }

    // Attempt Stripe cancellation first — if it throws, do not record churn row.
    // This ensures we don't write a churn row for a cancellation Stripe rejected.
    const stripe = createStripe(c.env);
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Flip cancelAtPeriodEnd atomically: the WHERE re-checks that it is still
    // false, so two concurrent cancels (double-submit / two admins) cannot both
    // pass the JS guard above and both record a churn row + re-emit the
    // subscription_cancelled event. Stripe's cancel_at_period_end is idempotent
    // so calling it from both racers is harmless; only the row that actually
    // flips false→true records churn. The loser returns success idempotently.
    const [flipped] = await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptions.communityId, communityId),
          eq(subscriptions.cancelAtPeriodEnd, false),
        ),
      )
      .returning();

    if (!flipped) {
      // A concurrent cancel already scheduled it — do not duplicate the churn
      // record or the analytics event.
      return c.json({ ok: true, cancelAtPeriodEnd: true });
    }

    // Insert churn reason record after successful Stripe cancellation
    await db.insert(churnReasons).values({
      id: nanoid(),
      communityId,
      userId: session.user.id,
      reason,
      note: note ?? null,
      recordedAt: new Date(),
    });

    // Best-effort PostHog event. captureEvent swallows its own build/fetch
    // errors internally and resolves to void, so awaiting it cannot fail the
    // request — only the row that actually flipped false→true reaches here.
    await captureEvent(
      "subscription_cancelled",
      {
        reason,
        community_id: communityId,
        tier: sub?.tier ?? "starter",
      },
      session.user.id,
      c.env,
    );

    return c.json({ ok: true, cancelAtPeriodEnd: true });
  },
);

export default cancelRouter;
