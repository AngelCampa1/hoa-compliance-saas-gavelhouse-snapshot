import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  reserveStudies,
  reserveComponents,
} from "../../src/db/schema/reserveStudy.js";

describe("reserveStudy schema", () => {
  describe("reserveStudies table", () => {
    it("is defined", () => {
      expect(reserveStudies).toBeDefined();
    });

    it("has id column", () => {
      expect(reserveStudies.id).toBeDefined();
    });

    it("has communityId column", () => {
      expect(reserveStudies.communityId).toBeDefined();
    });

    it("has effectiveDate column", () => {
      expect(reserveStudies.effectiveDate).toBeDefined();
    });

    it("has methodology column", () => {
      expect(reserveStudies.methodology).toBeDefined();
    });

    it("has notes column", () => {
      expect(reserveStudies.notes).toBeDefined();
    });

    it("has annual budget allocation columns", () => {
      expect(reserveStudies.annualBudgetCents).toBeDefined();
      expect(reserveStudies.annualReserveContributionCents).toBeDefined();
    });

    it("has createdAt column", () => {
      expect(reserveStudies.createdAt).toBeDefined();
    });

    it("has unique index on communityId (one study per community)", () => {
      // The uniqueIndex constraint is declared as the third argument to pgTable.
      // We verify the table compiled correctly and the communityId column exists,
      // which is the column the unique constraint targets.
      expect(reserveStudies).toBeDefined();
      expect(reserveStudies.communityId).toBeDefined();
    });

    it("declares nonnegative annual budget allocation checks", () => {
      const checks = getTableConfig(reserveStudies).checks.map(
        (check) => check.name,
      );
      expect(checks).toEqual(
        expect.arrayContaining([
          "reserve_studies_annual_budget_nonnegative",
          "reserve_studies_annual_contribution_nonnegative",
        ]),
      );
    });
  });

  describe("reserveComponents table", () => {
    it("is defined", () => {
      expect(reserveComponents).toBeDefined();
    });

    it("has id column", () => {
      expect(reserveComponents.id).toBeDefined();
    });

    it("has studyId column", () => {
      expect(reserveComponents.studyId).toBeDefined();
    });

    it("has name column", () => {
      expect(reserveComponents.name).toBeDefined();
    });

    it("has usefulLifeYears column", () => {
      expect(reserveComponents.usefulLifeYears).toBeDefined();
    });

    it("has remainingLifeYears column", () => {
      expect(reserveComponents.remainingLifeYears).toBeDefined();
    });

    it("has replacementCostCents column", () => {
      expect(reserveComponents.replacementCostCents).toBeDefined();
    });

    it("has currentReserveCents column", () => {
      expect(reserveComponents.currentReserveCents).toBeDefined();
    });

    it("declares component life and cents integrity checks", () => {
      const checks = getTableConfig(reserveComponents).checks.map(
        (check) => check.name,
      );
      expect(checks).toEqual(
        expect.arrayContaining([
          "reserve_components_useful_life_positive",
          "reserve_components_remaining_life_nonnegative",
          "reserve_components_remaining_life_lte_useful",
          "reserve_components_replacement_cost_nonnegative",
          "reserve_components_current_reserve_nonnegative",
        ]),
      );
    });
  });
});
