ALTER TABLE "reserve_studies" ADD COLUMN "annual_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD COLUMN "annual_reserve_contribution_cents" integer;--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD CONSTRAINT "reserve_studies_allocation_pair_check" CHECK ((("annual_budget_cents" IS NULL AND "annual_reserve_contribution_cents" IS NULL) OR ("annual_budget_cents" IS NOT NULL AND "annual_reserve_contribution_cents" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD CONSTRAINT "reserve_studies_annual_budget_positive_check" CHECK (("annual_budget_cents" IS NULL OR "annual_budget_cents" > 0));--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD CONSTRAINT "reserve_studies_annual_reserve_contribution_nonnegative_check" CHECK (("annual_reserve_contribution_cents" IS NULL OR "annual_reserve_contribution_cents" >= 0));--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD CONSTRAINT "reserve_studies_annual_reserve_contribution_lte_budget_check" CHECK (("annual_budget_cents" IS NULL OR "annual_reserve_contribution_cents" <= "annual_budget_cents"));
