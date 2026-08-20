import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  PortfolioCreateInput,
  PortfolioUpdateInput,
  PortfolioLinkInput,
  priceIdToTier,
  tierMeets,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { portfolios, portfolioCommunities } from "../../db/schema/portfolio.js";
import { communityMembers, communities } from "../../db/schema/tenancy.js";
import { subscriptions } from "../../db/schema/billing.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent } from "../../lib/observability.js";
import { requirePortfolioOwner } from "../../domain/portfolio/membership.js";
import type { Env } from "../../types/env.js";

type Variables = { userId: string };

/**
 * Returns true if the given user has at least one community with an active
 * (or trialing or past_due) Portfolio-tier subscription.
 */
async function userHasPortfolioTier(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<boolean> {
  // Find all communities where the user is a member
  const memberships = await db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId));

  if (memberships.length === 0) return false;

  const communityIds = memberships.map((m) => m.communityId);

  // Check if any community has a Portfolio-tier active subscription
  const subs = await db
    .select({ tier: subscriptions.tier, status: subscriptions.status })
    .from(subscriptions)
    .where(inArray(subscriptions.communityId, communityIds));

  return subs.some(
    (sub) =>
      ["trialing", "active", "past_due"].includes(sub.status) &&
      tierMeets(
        sub.tier as "starter" | "growth" | "scale" | "portfolio",
        "portfolio",
      ),
  );
}

function isForbiddenError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 403
  );
}

const portfoliosRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

portfoliosRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// POST /portfolio
portfoliosRouter.post(
  "/portfolio",
  zValidator("json", PortfolioCreateInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const { name } = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    if (!(await userHasPortfolioTier(db, userId))) {
      return c.json({ error: "upgrade_required", minimum: "portfolio" }, 402);
    }

    const [row] = await db
      .insert(portfolios)
      .values({ id: nanoid(), name, ownerUserId: userId })
      .returning({ id: portfolios.id, name: portfolios.name });

    try {
      await captureEvent(
        "portfolio_created",
        {
          portfolio_id: row.id,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break portfolio creation.
    }

    return c.json({ portfolioId: row.id, name: row.name }, 201);
  },
);

// GET /portfolio
portfoliosRouter.get("/portfolio", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env);

  const rows = await db
    .select({
      id: portfolios.id,
      name: portfolios.name,
      ownerUserId: portfolios.ownerUserId,
      createdAt: portfolios.createdAt,
    })
    .from(portfolios)
    .where(eq(portfolios.ownerUserId, userId))
    .orderBy(desc(portfolios.createdAt));

  return c.json({ portfolios: rows });
});

// PATCH /portfolio/:id — rename portfolio (owner only)
portfoliosRouter.patch(
  "/portfolio/:id",
  zValidator("json", PortfolioUpdateInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const portfolioId = c.req.param("id");
    const { name } = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    if (!(await userHasPortfolioTier(db, userId))) {
      return c.json({ error: "upgrade_required", minimum: "portfolio" }, 402);
    }

    try {
      await requirePortfolioOwner(db, portfolioId, userId);
    } catch (err) {
      if (isForbiddenError(err)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      throw err;
    }

    const [updated] = await db
      .update(portfolios)
      .set({ name })
      .where(eq(portfolios.id, portfolioId))
      .returning({ id: portfolios.id, name: portfolios.name });

    if (!updated) return c.json({ error: "Portfolio not found" }, 404);

    try {
      await captureEvent(
        "portfolio_renamed",
        {
          portfolio_id: updated.id,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break portfolio renames.
    }

    return c.json({ portfolio: updated });
  },
);

// DELETE /portfolio/:id — delete portfolio if no linked communities (owner only)
portfoliosRouter.delete("/portfolio/:id", async (c) => {
  const portfolioId = c.req.param("id");
  const userId = c.get("userId");
  const db = createDb(c.env);

  if (!(await userHasPortfolioTier(db, userId))) {
    return c.json({ error: "upgrade_required", minimum: "portfolio" }, 402);
  }

  try {
    await requirePortfolioOwner(db, portfolioId, userId);
  } catch (err) {
    if (isForbiddenError(err)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    throw err;
  }

  const linkedCommunities = await db
    .select({ id: portfolioCommunities.id })
    .from(portfolioCommunities)
    .where(eq(portfolioCommunities.portfolioId, portfolioId))
    .limit(1);

  if (linkedCommunities.length > 0) {
    return c.json(
      { error: "Portfolio has linked communities. Remove them first." },
      409,
    );
  }

  await db.delete(portfolios).where(eq(portfolios.id, portfolioId));

  try {
    await captureEvent(
      "portfolio_deleted",
      {
        portfolio_id: portfolioId,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break portfolio deletion.
  }

  return c.json({ ok: true });
});

// POST /portfolio/:id/communities
portfoliosRouter.post(
  "/portfolio/:id/communities",
  zValidator("json", PortfolioLinkInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const portfolioId = c.req.param("id");
    const data = c.req.valid("json");
    const { communityId } = data;
    const userId = c.get("userId");
    const db = createDb(c.env);

    if (data.portfolioId !== portfolioId) {
      return c.json({ error: "portfolioId must match path" }, 400);
    }

    try {
      await requirePortfolioOwner(db, portfolioId, userId);
    } catch (err) {
      if (isForbiddenError(err)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      throw err;
    }

    // Verify user is a member of the community
    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) return c.json({ error: "Forbidden" }, 403);

    // Inline tier check: community must have Portfolio tier
    const [community] = await db
      .select({ stripePriceId: communities.stripePriceId })
      .from(communities)
      .where(eq(communities.id, communityId))
      .limit(1);

    if (!community) return c.json({ error: "Community not found" }, 404);

    const [subscription] = await db
      .select({ tier: subscriptions.tier, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.communityId, communityId))
      .limit(1);

    const tier =
      subscription &&
      ["trialing", "active", "past_due"].includes(subscription.status)
        ? subscription.tier
        : priceIdToTier(community.stripePriceId);

    if (!tierMeets(tier, "portfolio")) {
      return c.json({ error: "upgrade_required", minimum: "portfolio" }, 402);
    }

    await db
      .insert(portfolioCommunities)
      .values({ id: nanoid(), portfolioId, communityId })
      .onConflictDoNothing();

    try {
      await captureEvent(
        "portfolio_community_linked",
        {
          community_id: communityId,
          membership_role: membership.role,
          portfolio_id: portfolioId,
          tier,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break community linking.
    }

    return c.json({ ok: true, portfolioId, communityId });
  },
);

// DELETE /portfolio/:id/communities/:communityId
portfoliosRouter.delete(
  "/portfolio/:id/communities/:communityId",
  async (c) => {
    const portfolioId = c.req.param("id");
    const communityId = c.req.param("communityId");
    const userId = c.get("userId");
    const db = createDb(c.env);

    try {
      await requirePortfolioOwner(db, portfolioId, userId);
    } catch (err) {
      if (isForbiddenError(err)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      throw err;
    }

    await db
      .delete(portfolioCommunities)
      .where(
        and(
          eq(portfolioCommunities.portfolioId, portfolioId),
          eq(portfolioCommunities.communityId, communityId),
        ),
      );

    try {
      await captureEvent(
        "portfolio_community_unlinked",
        {
          community_id: communityId,
          portfolio_id: portfolioId,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break community unlinking.
    }

    return c.json({ ok: true });
  },
);

export default portfoliosRouter;
