CREATE TABLE "reserve_components" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"name" text NOT NULL,
	"useful_life_years" integer NOT NULL,
	"remaining_life_years" integer NOT NULL,
	"replacement_cost_cents" integer NOT NULL,
	"current_reserve_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_studies" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"effective_date" date NOT NULL,
	"methodology" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserve_components" ADD CONSTRAINT "reserve_components_study_id_reserve_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."reserve_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_studies" ADD CONSTRAINT "reserve_studies_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reserve_studies_community_id_unique" ON "reserve_studies" USING btree ("community_id");