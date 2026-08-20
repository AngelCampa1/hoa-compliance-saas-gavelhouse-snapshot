CREATE TABLE "feedback_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"page_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_submissions_user_id_idx" ON "feedback_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_submissions_created_at_idx" ON "feedback_submissions" USING btree ("created_at");