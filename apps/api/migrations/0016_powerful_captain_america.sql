CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "subscriptions" SET "status" = 'pending_trial' WHERE "status" = 'pending_checkout';--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending_trial'::text;--> statement-breakpoint
DROP TYPE "public"."trial_status";--> statement-breakpoint
CREATE TYPE "public"."trial_status" AS ENUM('pending_trial', 'trialing', 'active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending_trial'::"public"."trial_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."trial_status" USING "status"::"public"."trial_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cycle" "billing_cycle";
