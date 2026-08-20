CREATE TABLE "bank_statement_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"statement_id" text NOT NULL,
	"community_id" text NOT NULL,
	"posted_date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"account_id" text NOT NULL,
	"statement_date" date NOT NULL,
	"beginning_balance_cents" integer NOT NULL,
	"ending_balance_cents" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_id" text NOT NULL,
	"community_id" text NOT NULL,
	"statement_line_id" text NOT NULL,
	"payment_id" text,
	"journal_line_id" text
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "portfolio_communities" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"community_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "close_checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"close_id" text NOT NULL,
	"community_id" text NOT NULL,
	"step" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "month_end_closes" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"audit_pack_key" text
);
--> statement-breakpoint
CREATE TABLE "churn_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_reconciliation_id_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_statement_line_id_bank_statement_lines_id_fk" FOREIGN KEY ("statement_line_id") REFERENCES "public"."bank_statement_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_communities" ADD CONSTRAINT "portfolio_communities_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_communities" ADD CONSTRAINT "portfolio_communities_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_checklist_items" ADD CONSTRAINT "close_checklist_items_close_id_month_end_closes_id_fk" FOREIGN KEY ("close_id") REFERENCES "public"."month_end_closes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_end_closes" ADD CONSTRAINT "month_end_closes_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statements_community_idx" ON "bank_statements" USING btree ("community_id","statement_date");--> statement-breakpoint
CREATE UNIQUE INDEX "recon_match_line_uniq" ON "reconciliation_matches" USING btree ("statement_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_community_uniq" ON "portfolio_communities" USING btree ("portfolio_id","community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "close_item_uniq" ON "close_checklist_items" USING btree ("close_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "close_period_uniq" ON "month_end_closes" USING btree ("community_id","period_year","period_month");