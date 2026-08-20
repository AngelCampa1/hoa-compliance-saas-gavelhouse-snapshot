import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

/**
 * Durable record of every AI-CS support escalation raised from the dashboard.
 *
 * The BFF persists one row here **before** forwarding the escalation to the
 * AI-CS Worker, so a human-actionable ticket survives even when the Worker is
 * unreachable. Rows are reviewed by the support team; `status` tracks triage.
 */
export const aiCsEscalations = pgTable(
  "ai_cs_escalations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Better Auth user ID of the escalating user. */
    userId: text("user_id").notNull(),
    /** Authenticated email of the escalating user, captured server-side. */
    userEmail: text("user_email").notNull(),
    /** AI-CS Worker session the escalation belongs to. */
    sessionId: text("session_id").notNull(),
    /** Optional machine reason code supplied by the widget. */
    reason: text("reason"),
    /** Optional free-form message the user attached to the escalation. */
    message: text("message"),
    /** Optional contact detail (string, or JSON-serialized object). */
    contact: text("contact"),
    /** Triage state — defaults to `open` on insert. */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_cs_escalations_user_id_idx").on(t.userId),
    index("ai_cs_escalations_session_id_idx").on(t.sessionId),
    index("ai_cs_escalations_created_at_idx").on(t.createdAt),
  ],
);
