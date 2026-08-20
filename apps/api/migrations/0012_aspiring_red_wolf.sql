CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE TABLE "lead_magnet_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"magnet_slug" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_page" text,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"posthog_distinct_id" text,
	CONSTRAINT "leads_email_unique" UNIQUE("email"),
	CONSTRAINT "leads_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "nurture_sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"magnet_slug" text NOT NULL,
	"current_step" smallint DEFAULT 0 NOT NULL,
	"next_send_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_magnet_downloads" ADD CONSTRAINT "lead_magnet_downloads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nurture_sequence_enrollments" ADD CONSTRAINT "nurture_sequence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_magnet_downloads_lead_magnet_unique" ON "lead_magnet_downloads" USING btree ("lead_id","magnet_slug");--> statement-breakpoint
CREATE INDEX "lead_magnet_downloads_magnet_slug_idx" ON "lead_magnet_downloads" USING btree ("magnet_slug");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "nurture_sequence_enrollments_status_next_send_at_idx" ON "nurture_sequence_enrollments" USING btree ("status","next_send_at");