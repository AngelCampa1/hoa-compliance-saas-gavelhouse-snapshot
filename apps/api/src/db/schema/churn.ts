import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";
import { user } from "./auth.js";

export const churnReasons = pgTable(
  "churn_reasons",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("churn_reasons_community_id_idx").on(t.communityId)],
);
