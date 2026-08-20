import {
  check,
  pgTable,
  text,
  integer,
  timestamp,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communities } from "./tenancy.js";

export const reserveStudies = pgTable(
  "reserve_studies",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date").notNull(),
    methodology: text("methodology"),
    notes: text("notes"),
    annualBudgetCents: integer("annual_budget_cents"),
    annualReserveContributionCents: integer(
      "annual_reserve_contribution_cents",
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reserve_studies_community_id_unique").on(table.communityId),
    check(
      "reserve_studies_annual_budget_nonnegative",
      sql`${table.annualBudgetCents} IS NULL OR ${table.annualBudgetCents} >= 0`,
    ),
    check(
      "reserve_studies_annual_contribution_nonnegative",
      sql`${table.annualReserveContributionCents} IS NULL OR ${table.annualReserveContributionCents} >= 0`,
    ),
  ],
);

export const reserveComponents = pgTable(
  "reserve_components",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id")
      .notNull()
      .references(() => reserveStudies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    usefulLifeYears: integer("useful_life_years").notNull(),
    remainingLifeYears: integer("remaining_life_years").notNull(),
    replacementCostCents: integer("replacement_cost_cents").notNull(),
    currentReserveCents: integer("current_reserve_cents").notNull(),
  },
  (table) => [
    check(
      "reserve_components_useful_life_positive",
      sql`${table.usefulLifeYears} >= 1`,
    ),
    check(
      "reserve_components_remaining_life_nonnegative",
      sql`${table.remainingLifeYears} >= 0`,
    ),
    check(
      "reserve_components_remaining_life_lte_useful",
      sql`${table.remainingLifeYears} <= ${table.usefulLifeYears}`,
    ),
    check(
      "reserve_components_replacement_cost_nonnegative",
      sql`${table.replacementCostCents} >= 0`,
    ),
    check(
      "reserve_components_current_reserve_nonnegative",
      sql`${table.currentReserveCents} >= 0`,
    ),
  ],
);
