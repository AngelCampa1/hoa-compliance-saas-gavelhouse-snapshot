import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";
import { user } from "./auth.js";
import { accounts, fundTypeEnum } from "./accounts.js";

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  entryDate: date("entry_date").notNull(),
  memo: text("memo").notNull(),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  postedAt: timestamp("posted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reversedByEntryId: text("reversed_by_entry_id").references(
    (): AnyPgColumn => journalEntries.id,
    { onDelete: "set null" },
  ),
});

export const journalLines = pgTable("journal_lines", {
  id: text("id").primaryKey(),
  entryId: text("entry_id")
    .notNull()
    .references(() => journalEntries.id, { onDelete: "cascade" }),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  debitCents: integer("debit_cents").notNull().default(0),
  creditCents: integer("credit_cents").notNull().default(0),
  fundType: fundTypeEnum("fund_type").notNull(),
});
