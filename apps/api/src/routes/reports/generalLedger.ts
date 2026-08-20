import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { LedgerQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { generalLedger } from "../../domain/reporting/generalLedger.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";
import { accounts } from "../../db/schema/accounts.js";

type Variables = { userId: string };

const generalLedgerRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Session auth middleware
generalLedgerRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/general-ledger
generalLedgerRouter.get("/reports/general-ledger",
  zValidator("query", LedgerQuery, (result, c) => {
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
    const { communityId, from, to, accountId, fundType, limit, offset } = c.req.valid("query");
    const db = createDb(c.env);

    // Verify accountId belongs to the current community before querying
    if (accountId !== undefined) {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, accountId),
            eq(accounts.communityId, communityId),
          ),
        )
        .limit(1);
      if (!account) {
        return c.json({ error: "Account not found" }, 404);
      }
    }

    const { rows, total } = await generalLedger(
      db,
      communityId,
      from,
      to,
      accountId,
      fundType,
      limit,
      offset,
    );
    await insertAuditEvent(db, {
      communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "report_export",
      entityId: "general-ledger",
    });
    return c.json({
      rows: rows.map((row) => ({
        id: row.entryId,
        entryDate: row.entryDate,
        memo: row.memo,
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        fundType: row.fundType,
        debitCents: row.debitCents,
        creditCents: row.creditCents,
        runningBalance: row.runningBalanceCents,
      })),
      total,
      limit,
      offset,
    });
  },
);

export default generalLedgerRouter;
