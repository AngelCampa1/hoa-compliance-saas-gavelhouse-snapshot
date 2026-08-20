CREATE TABLE "ai_cs_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"session_id" text NOT NULL,
	"reason" text,
	"message" text,
	"contact" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_cs_escalations_user_id_idx" ON "ai_cs_escalations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_cs_escalations_session_id_idx" ON "ai_cs_escalations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_cs_escalations_created_at_idx" ON "ai_cs_escalations" USING btree ("created_at");