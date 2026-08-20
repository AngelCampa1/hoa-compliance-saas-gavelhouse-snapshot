import { Hono } from "hono";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import {
  recommendedTierFromUsage,
  type CommunityUsage,
  type Tier,
  type TierFeature,
} from "@boardstack/shared";
import { createDb } from "../db/client.js";
import {
  communities,
  communityMembers,
  invitations,
} from "../db/schema/tenancy.js";
import { units } from "../db/schema/dues.js";
import {
  archRequests,
  boardTransitions,
  ownerPortalSessions,
  violations,
} from "../db/schema/governance.js";
import { monthEndCloses } from "../db/schema/monthEndClose.js";
import { auditEvents } from "../db/schema/audit.js";
import { portfolios } from "../db/schema/portfolio.js";
import type { Env } from "../types/env.js";
import { getAuth } from "../lib/auth.js";

type Variables = { userId: string };

const usageRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

usageRouter.use("/communities/:id/usage", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

usageRouter.get("/communities/:id/usage", async (c) => {
  const communityId = c.req.param("id");
  const userId = c.get("userId");
  const db = createDb(c.env);

  const [membership] = await db
    .select({ role: communityMembers.role })
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return c.json({ error: "Forbidden" }, 403);

  const [homesRow] = await db
    .select({ value: count() })
    .from(units)
    .where(and(eq(units.communityId, communityId), eq(units.active, true)));

  const [seatRow] = await db
    .select({ value: count() })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId));

  const [pendingRow] = await db
    .select({ value: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.communityId, communityId),
        isNull(invitations.consumedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );

  const featuresUsed = await detectFeaturesUsed(db, communityId, userId);

  const usage: CommunityUsage = {
    homes: homesRow?.value ?? 0,
    boardUsers: seatRow?.value ?? 0,
    pendingInvites: pendingRow?.value ?? 0,
    featuresUsed,
  };

  const recommendedTier: Tier = recommendedTierFromUsage(usage);

  return c.json({
    homes: usage.homes,
    boardUsers: usage.boardUsers,
    pendingInvites: usage.pendingInvites,
    featuresUsed,
    recommendedTier,
  });
});

async function detectFeaturesUsed(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
): Promise<TierFeature[]> {
  const used: TierFeature[] = [];

  const probes: Array<{
    feature: TierFeature;
    detect: () => Promise<boolean>;
  }> = [
    {
      feature: "governance-workflows",
      detect: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(archRequests)
          .where(eq(archRequests.communityId, communityId));
        if ((row?.value ?? 0) > 0) return true;
        const [row2] = await db
          .select({ value: count() })
          .from(violations)
          .where(eq(violations.communityId, communityId));
        if ((row2?.value ?? 0) > 0) return true;
        const [row3] = await db
          .select({ value: count() })
          .from(boardTransitions)
          .where(eq(boardTransitions.communityId, communityId));
        return (row3?.value ?? 0) > 0;
      },
    },
    {
      feature: "owner-operations",
      detect: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(ownerPortalSessions)
          .where(eq(ownerPortalSessions.communityId, communityId));
        return (row?.value ?? 0) > 0;
      },
    },
    {
      feature: "month-end-close",
      detect: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(monthEndCloses)
          .where(eq(monthEndCloses.communityId, communityId));
        return (row?.value ?? 0) > 0;
      },
    },
    {
      feature: "audit-pack",
      detect: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.communityId, communityId),
              eq(auditEvents.entityType, "audit_pack_export"),
            ),
          );
        return (row?.value ?? 0) > 0;
      },
    },
    {
      feature: "reports",
      detect: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.communityId, communityId),
              eq(auditEvents.entityType, "report_export"),
            ),
          );
        return (row?.value ?? 0) > 0;
      },
    },
    {
      feature: "portfolio-rollups",
      detect: async () => {
        const [ownedCommunities] = await db
          .select({ value: count() })
          .from(communities)
          .where(eq(communities.ownerUserId, userId));
        if ((ownedCommunities?.value ?? 0) > 1) return true;
        const [ownedPortfolios] = await db
          .select({ value: count() })
          .from(portfolios)
          .where(eq(portfolios.ownerUserId, userId));
        return (ownedPortfolios?.value ?? 0) > 0;
      },
    },
  ];

  for (const probe of probes) {
    try {
      if (await probe.detect()) {
        used.push(probe.feature);
      }
    } catch {
      // If a probe fails (e.g. missing column in a partial test fixture), skip
      // the feature rather than failing the whole usage response.
    }
  }

  return used;
}

export default usageRouter;
