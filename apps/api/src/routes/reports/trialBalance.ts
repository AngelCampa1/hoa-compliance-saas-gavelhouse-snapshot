import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { TrialBalanceQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { trialBalance } from "../../domain/reporting/trialBalance.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";

type Variables = { userId: string };

const trialBalanceRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Session auth middleware
trialBalanceRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/trial-balance
trialBalanceRouter.get("/reports/trial-balance",
  zValidator("query", TrialBalanceQuery, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid query parameters", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c, next) => {
    const { communityId } = c.req.valid("query");
    const userId = c.get("userId");
    const db = createDb(c.env);

    if (!(await hasReportCapability(db, communityId, userId, "report:read"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  },
  requireTier(createDb, TIER.scale),
  async (c) => {
    const { communityId, asOf } = c.req.valid("query");
    const db = createDb(c.env);
    const rows = await trialBalance(db, communityId, asOf);
    await insertAuditEvent(db, {
      communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "report_export",
      entityId: "trial-balance",
    });
    return c.json({ rows });
  },
);

export default trialBalanceRouter;
