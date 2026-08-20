import {
  pgTable,
  pgEnum,
  text,
  integer,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";
import { accounts } from "./accounts.js";

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "open",
  "finalized",
]);

export const bankStatements = pgTable(
  "bank_statements",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    statementDate: date("statement_date").notNull(),
    beginningBalanceCents: integer("beginning_balance_cents").notNull(),
    endingBalanceCents: integer("ending_balance_cents").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bank_statements_community_id_idx").on(
      t.communityId,
      t.statementDate,
    ),
  ],
);

export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: text("id").primaryKey(),
    statementId: text("statement_id")
      .notNull()
      .references(() => bankStatements.id, { onDelete: "cascade" }),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    postedDate: date("posted_date").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [index("bank_statement_lines_community_id_idx").on(t.communityId)],
);

export const reconciliations = pgTable("reconciliations", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  statementId: text("statement_id")
    .notNull()
    .references(() => bankStatements.id, { onDelete: "restrict" }),
  status: reconciliationStatusEnum("status").notNull().default("open"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedByUserId: text("finalized_by_user_id"),
});

export const reconciliationMatches = pgTable(
  "reconciliation_matches",
  {
    id: text("id").primaryKey(),
    reconciliationId: text("reconciliation_id")
      .notNull()
      .references(() => reconciliations.id, { onDelete: "cascade" }),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    statementLineId: text("statement_line_id")
      .notNull()
      .references(() => bankStatementLines.id, { onDelete: "restrict" }),
    paymentId: text("payment_id"),
    journalLineId: text("journal_line_id"),
  },
  (t) => [
    uniqueIndex("recon_match_line_uniq").on(t.statementLineId),
    index("reconciliation_matches_community_id_idx").on(t.communityId),
  ],
);
