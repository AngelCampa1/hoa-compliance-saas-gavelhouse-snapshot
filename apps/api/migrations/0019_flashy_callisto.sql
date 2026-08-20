CREATE TABLE "signup_nurture_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"current_step" smallint DEFAULT 1 NOT NULL,
	"next_send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_nurture_enrollments_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
ALTER TABLE "signup_nurture_enrollments" ADD CONSTRAINT "signup_nurture_enrollments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_nurture_enrollments_user_unique" ON "signup_nurture_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signup_nurture_enrollments_status_next_send_at_idx" ON "signup_nurture_enrollments" USING btree ("status","next_send_at");