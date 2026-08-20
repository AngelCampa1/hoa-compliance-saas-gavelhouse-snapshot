import type { MiddlewareHandler } from "hono";
import { tierMeets, type Tier } from "@boardstack/shared";
import type { Db, Env as DbEnv } from "../../db/client.js";
import { getCommunityTierResult } from "../policy/access.js";

async function extractCommunityId(
  c: Parameters<MiddlewareHandler>[0],
): Promise<string | null> {
  const fromQuery = c.req.query("communityId");
  if (fromQuery) return fromQuery;
  try {
    // communityId is extracted from query params for GET routes and from the request body
    // for POST/PATCH routes. On POST routes, this middleware must run AFTER zValidator
    // so the body has already been parsed and cached — calling c.req.json() twice is safe
    // only when Hono has already consumed and cached the body via zValidator.
    const body = await c.req.json();
    return typeof body?.communityId === "string" ? body.communityId : null;
  } catch {
    return null;
  }
}

export function requireTier(
  createDb: (env: DbEnv) => Db,
  minimum: Tier,
): MiddlewareHandler {
  return async (c, next) => {
    const communityId = await extractCommunityId(c);
    if (!communityId) return c.json({ error: "communityId required" }, 400);
    const db = createDb(c.env as DbEnv);
    const result = await getCommunityTierResult(db, communityId);
    if (!result.found) return c.json({ error: "community not found" }, 404);
    if (!tierMeets(result.tier, minimum)) {
      return c.json({ error: "upgrade_required", minimum }, 403);
    }
    await next();
  };
}
