CREATE TYPE "public"."reconciliation_status" AS ENUM('open', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."close_status" AS ENUM('open', 'complete');--> statement-breakpoint
CREATE TYPE "public"."close_step" AS ENUM('reconcile_bank', 'review_tb', 'post_adjustments', 'finalize_minutes', 'generate_pack');--> statement-breakpoint
ALTER TABLE "bank_statements" DROP CONSTRAINT "bank_statements_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "reconciliation_matches" DROP CONSTRAINT "reconciliation_matches_statement_line_id_bank_statement_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "reconciliations" DROP CONSTRAINT "reconciliations_statement_id_bank_statements_id_fk";
--> statement-breakpoint
DROP INDEX "bank_statements_community_idx";--> statement-breakpoint
ALTER TABLE "reconciliations" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."reconciliation_status";--> statement-breakpoint
ALTER TABLE "reconciliations" ALTER COLUMN "status" SET DATA TYPE "public"."reconciliation_status" USING "status"::"public"."reconciliation_status";--> statement-breakpoint
ALTER TABLE "close_checklist_items" ALTER COLUMN "step" SET DATA TYPE "public"."close_step" USING "step"::"public"."close_step";--> statement-breakpoint
ALTER TABLE "month_end_closes" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."close_status";--> statement-breakpoint
ALTER TABLE "month_end_closes" ALTER COLUMN "status" SET DATA TYPE "public"."close_status" USING "status"::"public"."close_status";--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_statement_line_id_bank_statement_lines_id_fk" FOREIGN KEY ("statement_line_id") REFERENCES "public"."bank_statement_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_checklist_items" ADD CONSTRAINT "close_checklist_items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statement_lines_community_id_idx" ON "bank_statement_lines" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "bank_statements_community_id_idx" ON "bank_statements" USING btree ("community_id","statement_date");--> statement-breakpoint
CREATE INDEX "reconciliation_matches_community_id_idx" ON "reconciliation_matches" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "close_checklist_items_community_id_idx" ON "close_checklist_items" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "churn_reasons_community_id_idx" ON "churn_reasons" USING btree ("community_id");