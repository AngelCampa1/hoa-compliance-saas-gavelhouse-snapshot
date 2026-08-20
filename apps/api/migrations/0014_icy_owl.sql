-- EDITED after the fact. The generated migration originally continued:
--
--   ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending_checkout';
--
-- Postgres refuses to use an enum value in the same transaction that added it,
-- and drizzle-kit wraps an entire migration run in one transaction. Applying
-- these migrations one at a time (as production did, incrementally) never hit
-- it; a from-scratch run always failed and rolled back all 27.
--
-- The statement was dead anyway: 0016_powerful_captain_america.sql drops and
-- recreates trial_status without 'pending_checkout', migrates any existing rows
-- to 'pending_trial', and resets the default. No application code references
-- the value. Removing it changes nothing about the final schema.
ALTER TYPE "public"."trial_status" ADD VALUE 'pending_checkout' BEFORE 'trialing';--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "trial_ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_started_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ending_reminder_sent_at" timestamp with time zone;