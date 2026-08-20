import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

/**
 * citext — case-insensitive text. Requires the `citext` Postgres extension
 * (created in the migration that adds this table). Compared as lowercase
 * at the database level.
 */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: citext("email").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourcePage: text("source_page"),
    unsubscribeToken: uuid("unsubscribe_token")
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    surveyToken: uuid("survey_token")
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    surveyAnswers:
      jsonb("survey_answers").$type<
        Array<{ questionId: string; answer: string }>
      >(),
    surveyCompletedAt: timestamp("survey_completed_at", {
      withTimezone: true,
    }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    posthogDistinctId: text("posthog_distinct_id"),
  },
  (t) => [index("leads_email_idx").on(t.email)],
);

export const leadMagnetDownloads = pgTable(
  "lead_magnet_downloads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    magnetSlug: text("magnet_slug").notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("lead_magnet_downloads_lead_magnet_unique").on(
      t.leadId,
      t.magnetSlug,
    ),
    index("lead_magnet_downloads_magnet_slug_idx").on(t.magnetSlug),
  ],
);
