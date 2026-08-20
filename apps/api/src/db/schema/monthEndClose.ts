import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";

export const closeStatusEnum = pgEnum("close_status", ["open", "complete"]);

export const closeStepEnum = pgEnum("close_step", [
  "reconcile_bank",
  "review_tb",
  "post_adjustments",
  "finalize_minutes",
  "generate_pack",
]);

export const monthEndCloses = pgTable(
  "month_end_closes",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    status: closeStatusEnum("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    auditPackKey: text("audit_pack_key"),
  },
  (t) => [
    uniqueIndex("close_period_uniq").on(
      t.communityId,
      t.periodYear,
      t.periodMonth,
    ),
  ],
);

export const closeChecklistItems = pgTable(
  "close_checklist_items",
  {
    id: text("id").primaryKey(),
    closeId: text("close_id")
      .notNull()
      .references(() => monthEndCloses.id, { onDelete: "cascade" }),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    step: closeStepEnum("step").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: text("completed_by_user_id"),
  },
  (t) => [
    uniqueIndex("close_item_uniq").on(t.closeId, t.step),
    index("close_checklist_items_community_id_idx").on(t.communityId),
  ],
);
