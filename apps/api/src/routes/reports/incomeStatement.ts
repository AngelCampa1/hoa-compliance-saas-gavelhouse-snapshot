import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { LedgerQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { incomeStatement } from "../../domain/reporting/incomeStatement.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";

// Only the fields the income statement needs: communityId, from, to
const IncomeStatementQuery = LedgerQuery.pick({
  communityId: true,
  from: true,
  to: true,
});

type Variables = { userId: string };

const incomeStatementRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Session auth middleware
incomeStatementRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/income-statement
incomeStatementRouter.get("/reports/income-statement",
  zValidator("query", IncomeStatementQuery, (result, c) => {
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
    const { communityId, from, to } = c.req.valid("query");
    const db = createDb(c.env);
    const result = await incomeStatement(db, communityId, from, to);
    await insertAuditEvent(db, {
      communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "report_export",
      entityId: "income-statement",
    });
    return c.json({
      rows: [
        {
          fundType: "operating",
          revenue: result.operatingRevenueCents,
          expenses: result.operatingExpenseCents,
          netIncome: result.operatingNetCents,
        },
        {
          fundType: "reserve",
          revenue: result.reserveRevenueCents,
          expenses: result.reserveExpenseCents,
          netIncome: result.reserveNetCents,
        },
      ],
    });
  },
);

export default incomeStatementRouter;
