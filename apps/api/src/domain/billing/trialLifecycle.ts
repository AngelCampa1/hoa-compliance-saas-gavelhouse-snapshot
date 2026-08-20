import { eq } from "drizzle-orm";
import { PRICING_TIERS, TRIAL_ENDING_REMINDER_DAYS } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { communities } from "../../db/schema/tenancy.js";
import { subscriptions, user } from "../../db/schema/index.js";
import type { Env } from "../../types/env.js";
import {
  buildTrialEndingReminderEmail,
  buildTrialStartedEmail,
  sendTrialEmail,
} from "./trialEmails.js";

function formatAmountLabel(
  tier: string,
  cycle: "monthly" | "annual" | null,
): string {
  const pricingTier = PRICING_TIERS.find((entry) => entry.slug === tier);
  if (!pricingTier) {
    return cycle === "annual" ? "your annual rate" : "your monthly rate";
  }
  if (cycle === "annual") {
    return `$${((pricingTier.annualPriceCents * 12) / 100).toFixed(2)}/year`;
  }
  return `$${(pricingTier.monthlyPriceCents / 100).toFixed(2)}/month`;
}

export async function sendTrialStartedEmailForCommunity(
  env: Env,
  communityId: string,
): Promise<void> {
  const db = createDb(env);
  const [row] = await db
    .select({
      subscriptionId: subscriptions.id,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      trialStartedAt: subscriptions.trialStartedAt,
      trialEndsAt: subscriptions.trialEndsAt,
      trialStartedEmailSentAt: subscriptions.trialStartedEmailSentAt,
      tier: subscriptions.tier,
      cycle: subscriptions.cycle,
      communityName: communities.name,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(subscriptions)
    .innerJoin(communities, eq(communities.id, subscriptions.communityId))
    .innerJoin(user, eq(user.id, communities.ownerUserId))
    .where(eq(subscriptions.communityId, communityId))
    .limit(1);

  if (
    !row ||
    row.trialStartedEmailSentAt !== null ||
    row.trialStartedAt === null ||
    row.trialEndsAt === null
  ) {
    return;
  }

  await sendTrialEmail(
    await buildTrialStartedEmail(
      {
        email: row.ownerEmail,
        recipientName: row.ownerName,
        communityName: row.communityName,
        planName: row.tier[0].toUpperCase() + row.tier.slice(1),
        amountLabel: formatAmountLabel(row.tier, row.cycle),
        trialStartedAt: row.trialStartedAt,
        trialEndsAt: row.trialEndsAt,
        billingConfigured: row.stripeSubscriptionId !== null,
      },
      env,
    ),
    env.RESEND_API_KEY,
  );

  await db
    .update(subscriptions)
    .set({
      trialStartedEmailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, row.subscriptionId));
}

export async function sendTrialStartedEmailSweep(env: Env): Promise<void> {
  const db = createDb(env);
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      trialStartedAt: subscriptions.trialStartedAt,
      trialEndsAt: subscriptions.trialEndsAt,
      trialStartedEmailSentAt: subscriptions.trialStartedEmailSentAt,
      tier: subscriptions.tier,
      cycle: subscriptions.cycle,
      communityName: communities.name,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(subscriptions)
    .innerJoin(communities, eq(communities.id, subscriptions.communityId))
    .innerJoin(user, eq(user.id, communities.ownerUserId))
    .where(eq(subscriptions.status, "trialing"));

  for (const row of rows) {
    if (
      row.trialStartedEmailSentAt !== null ||
      row.trialStartedAt === null ||
      row.trialEndsAt === null
    ) {
      continue;
    }

    await sendTrialEmail(
      await buildTrialStartedEmail(
        {
          email: row.ownerEmail,
          recipientName: row.ownerName,
          communityName: row.communityName,
          planName: row.tier[0].toUpperCase() + row.tier.slice(1),
          amountLabel: formatAmountLabel(row.tier, row.cycle),
          trialStartedAt: row.trialStartedAt,
          trialEndsAt: row.trialEndsAt,
          billingConfigured: row.stripeSubscriptionId !== null,
        },
        env,
      ),
      env.RESEND_API_KEY,
    );

    await db
      .update(subscriptions)
      .set({
        trialStartedEmailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, row.subscriptionId));
  }
}

export async function sendTrialEndingReminderSweep(env: Env): Promise<void> {
  const db = createDb(env);
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      trialStartedAt: subscriptions.trialStartedAt,
      trialEndsAt: subscriptions.trialEndsAt,
      trialEndingReminderSentAt: subscriptions.trialEndingReminderSentAt,
      tier: subscriptions.tier,
      cycle: subscriptions.cycle,
      communityName: communities.name,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(subscriptions)
    .innerJoin(communities, eq(communities.id, subscriptions.communityId))
    .innerJoin(user, eq(user.id, communities.ownerUserId))
    .where(eq(subscriptions.status, "trialing"));

  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    if (
      row.trialEndingReminderSentAt !== null ||
      row.trialStartedAt === null ||
      row.trialEndsAt === null
    ) {
      continue;
    }

    const reminderDate = new Date(
      row.trialEndsAt.getTime() -
        TRIAL_ENDING_REMINDER_DAYS * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    const trialEndDate = row.trialEndsAt.toISOString().slice(0, 10);
    // Fire on the reminder date, or on the first sweep after it if a run was
    // missed (downtime, late cron, clock skew). The row is gated by
    // trialEndingReminderSentAt, so it still sends at most once. An exact
    // `=== today` match would skip the row forever after a single missed day.
    // Never send once the trial has already ended — an "ending soon" reminder
    // would then be stale.
    if (reminderDate > today || today > trialEndDate) {
      continue;
    }

    await sendTrialEmail(
      await buildTrialEndingReminderEmail(
        {
          email: row.ownerEmail,
          recipientName: row.ownerName,
          communityName: row.communityName,
          planName: row.tier[0].toUpperCase() + row.tier.slice(1),
          amountLabel: formatAmountLabel(row.tier, row.cycle),
          trialStartedAt: row.trialStartedAt,
          trialEndsAt: row.trialEndsAt,
          billingConfigured: row.stripeSubscriptionId !== null,
        },
        env,
      ),
      env.RESEND_API_KEY,
    );

    await db
      .update(subscriptions)
      .set({
        trialEndingReminderSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, row.subscriptionId));
  }
}

export async function expireTrialsWithoutBillingSweep(env: Env): Promise<void> {
  const db = createDb(env);
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      trialEndsAt: subscriptions.trialEndsAt,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, "trialing"));

  const now = Date.now();

  for (const row of rows) {
    if (row.stripeSubscriptionId !== null || row.trialEndsAt === null) {
      continue;
    }

    if (row.trialEndsAt.getTime() > now) {
      continue;
    }

    await db
      .update(subscriptions)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, row.subscriptionId));
  }
}
