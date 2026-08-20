import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communities } from "./tenancy.js";
import { fundTypeEnum } from "./accounts.js";
import { journalEntries } from "./journal.js";

export const assessmentStatusEnum = pgEnum("assessment_status", [
  "pending",
  "paid",
  "past_due",
  "waived",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "ach",
  "card",
  "check",
  "other",
]);

export const units = pgTable("units", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  unitNumber: text("unit_number"),
  sqft: integer("sqft"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const homeowners = pgTable(
  "homeowners",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    moveInDate: date("move_in_date"),
    stripeCustomerId: text("stripe_customer_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("homeowners_community_id_email_unique").on(
      table.communityId,
      table.email,
    ),
  ],
);

export const unitOwnerships = pgTable("unit_ownerships", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  homeownerId: text("homeowner_id")
    .notNull()
    .references(() => homeowners.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  primary: boolean("primary").notNull().default(true),
});

export const assessments = pgTable("assessments", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  period: text("period").notNull(),
  amountCents: integer("amount_cents").notNull(),
  fundType: fundTypeEnum("fund_type").notNull(),
  dueDate: date("due_date").notNull(),
  status: assessmentStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    homeownerId: text("homeowner_id").references(() => homeowners.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    method: paymentMethodEnum("method").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    journalEntryId: text("journal_entry_id").references(
      () => journalEntries.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Partial unique index: prevents duplicate payment rows for the same
    // Stripe PaymentIntent (idempotency guard for at-least-once webhook delivery).
    // NULL values are excluded so non-Stripe payments are not affected.
    uniqueIndex("payments_stripe_pi_unique")
      .on(table.stripePaymentIntentId)
      .where(sql`${table.stripePaymentIntentId} IS NOT NULL`),
  ],
);
