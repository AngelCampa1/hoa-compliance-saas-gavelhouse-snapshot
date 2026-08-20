WITH ranked_members AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY community_id, user_id
      ORDER BY
        accepted_at ASC NULLS LAST,
        invited_at ASC,
        id ASC
    ) AS rn
  FROM "community_members"
)
DELETE FROM "community_members"
USING ranked_members
WHERE "community_members"."id" = ranked_members.id
  AND ranked_members.rn > 1;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "community_members_community_user_unique" ON "community_members" USING btree ("community_id","user_id");
