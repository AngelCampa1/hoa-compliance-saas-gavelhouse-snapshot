import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";

export const communityActivation = pgTable("community_activation", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .unique()
    .references(() => communities.id, { onDelete: "cascade" }),
  rosterImported: boolean("roster_imported").notNull().default(false),
  rosterImportedAt: timestamp("roster_imported_at", { withTimezone: true }),
  reservePopulated: boolean("reserve_populated").notNull().default(false),
  reservePopulatedAt: timestamp("reserve_populated_at", { withTimezone: true }),
  complianceAcknowledged: boolean("compliance_acknowledged")
    .notNull()
    .default(false),
  complianceAcknowledgedAt: timestamp("compliance_acknowledged_at", {
    withTimezone: true,
  }),
  dueBatchConfigured: boolean("dues_batch_configured").notNull().default(false),
  dueBatchConfiguredAt: timestamp("dues_batch_configured_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
