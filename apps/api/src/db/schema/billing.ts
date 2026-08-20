import { pgTable, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";
import { TIER_VALUES } from "@boardstack/shared";

export const trialStatusEnum = pgEnum("trial_status", [
  "pending_trial",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
export const tierSlugEnum = pgEnum("tier_slug", TIER_VALUES);

export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .unique()
    .references(() => communities.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  tier: tierSlugEnum("tier").notNull().default("starter"),
  cycle: billingCycleEnum("cycle"),
  status: trialStatusEnum("status").notNull().default("pending_trial"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  trialStartedEmailSentAt: timestamp("trial_started_email_sent_at", {
    withTimezone: true,
  }),
  trialEndingReminderSentAt: timestamp("trial_ending_reminder_sent_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
