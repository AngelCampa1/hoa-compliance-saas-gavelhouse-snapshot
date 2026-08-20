import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { AuditPackQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { buildAuditPack } from "../../domain/reporting/auditPack.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };

const auditPackRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

async function captureReportExportEvent(
  name: "report_export_downloaded" | "report_export_failed",
  properties: Record<string, unknown>,
  userId: string,
  env: Env,
): Promise<void> {
  try {
    await captureEvent(name, properties, userId, env);
  } catch {
    // Analytics is best-effort and must not affect report downloads.
  }
}

// Session auth middleware
auditPackRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/audit-pack
auditPackRouter.get("/reports/audit-pack",
  zValidator("query", AuditPackQuery, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid query parameters", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c, next) => {
    const query = c.req.valid("query");
    const userId = c.get("userId");
    const db = createDb(c.env);

    if (
      !(await hasReportCapability(
        db,
        query.communityId,
        userId,
        "report:export",
      ))
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  },
  requireTier(createDb, TIER.scale),
  async (c) => {
    const query = c.req.valid("query");
    const db = createDb(c.env);
    const stream = await buildAuditPack(db, query);

    const filename = `audit-pack-${query.periodStart}-${query.periodEnd}-${query.communityId}.zip`;
    await insertAuditEvent(db, {
      communityId: query.communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "audit_pack_export",
      entityId: filename,
    });
    await captureReportExportEvent(
      "report_export_downloaded",
      {
        community_id: query.communityId,
        period_end: query.periodEnd,
        period_start: query.periodStart,
        report_type: "audit_pack",
      },
      c.get("userId"),
      c.env,
    );

    return c.body(stream, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
  },
);

export default auditPackRouter;
