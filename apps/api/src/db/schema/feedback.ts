import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

/**
 * Stores in-app feedback submissions from authenticated dashboard users.
 * One row per submission — no deduplication. Queried manually by the team
 * when reviewing feedback; also forwarded to PostHog as `feedback_submitted`.
 */
export const feedbackSubmissions = pgTable(
  "feedback_submissions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Better Auth user ID of the submitting user. */
    userId: text("user_id").notNull(),
    /** Feedback category chosen by the user. */
    category: text("category").notNull(),
    /** Free-form message text (max 2 000 chars enforced at the API layer). */
    message: text("message").notNull(),
    /** Full URL of the page the user was on when they submitted. */
    pageUrl: text("page_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("feedback_submissions_user_id_idx").on(t.userId),
    index("feedback_submissions_created_at_idx").on(t.createdAt),
  ],
);
