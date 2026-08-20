import {
  pgTable,
  text,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { communities } from "./tenancy.js";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const fundTypeEnum = pgEnum("fund_type", ["operating", "reserve"]);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    fundType: fundTypeEnum("fund_type").notNull(),
    parentAccountId: text("parent_account_id").references(
      (): AnyPgColumn => accounts.id,
      { onDelete: "set null" },
    ),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_community_id_code_unique").on(
      table.communityId,
      table.code,
    ),
  ],
);
