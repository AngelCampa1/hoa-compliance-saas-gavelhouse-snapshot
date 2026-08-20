import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { BalanceSheetQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { balanceSheet } from "../../domain/reporting/balanceSheet.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";

type Variables = { userId: string };

const balanceSheetRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Session auth middleware
balanceSheetRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/balance-sheet
balanceSheetRouter.get("/reports/balance-sheet",
  zValidator("query", BalanceSheetQuery, (result, c) => {
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
    const result = await balanceSheet(db, communityId, asOf);
    await insertAuditEvent(db, {
      communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "report_export",
      entityId: "balance-sheet",
    });
    return c.json({
      rows: result.sections.map((section) => ({
        accountType: section.accountType,
        fundType: section.fundType,
        balanceCents: section.totalCents,
      })),
    });
  },
);

export default balanceSheetRouter;
