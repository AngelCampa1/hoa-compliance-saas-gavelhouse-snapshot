import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../../db/client.js";
import { portfolioCommunities } from "../../db/schema/portfolio.js";
import { getAuth } from "../../lib/auth.js";
import { requirePortfolioOwner } from "../../domain/portfolio/membership.js";
import { getBatchCommunityRollup } from "./../../domain/portfolio/rollup.js";
import type { Env } from "../../types/env.js";

type Variables = { userId: string };

function isForbiddenError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 403
  );
}

const rollupRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

rollupRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /portfolio/:id/rollup
rollupRouter.get("/portfolio/:id/rollup", async (c) => {
  const portfolioId = c.req.param("id");
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

  const linkedRows = await db
    .select({ communityId: portfolioCommunities.communityId })
    .from(portfolioCommunities)
    .where(eq(portfolioCommunities.portfolioId, portfolioId));

  // Single aggregating query-set for all linked communities instead of the
  // previous O(N) fan-out that issued getCommunityRollup once per community.
  const communityIds = linkedRows.map((row) => row.communityId);
  const rollups = await getBatchCommunityRollup(db, communityIds);
  const communities = rollups.map(({ name, ...rollup }) => ({
    ...rollup,
    communityName: name,
  }));

  return c.json({ portfolioId, communities });
});

export default rollupRouter;
