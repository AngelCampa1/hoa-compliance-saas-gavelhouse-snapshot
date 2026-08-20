import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "post",
  "reverse",
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id"),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  diffJson: jsonb("diff_json"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
