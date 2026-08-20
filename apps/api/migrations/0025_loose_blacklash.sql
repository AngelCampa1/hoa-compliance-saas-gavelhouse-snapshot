ALTER TABLE "leads" ADD COLUMN "survey_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "survey_answers" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "survey_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_survey_token_unique" UNIQUE("survey_token");