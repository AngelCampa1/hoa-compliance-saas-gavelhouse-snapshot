import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { RoleHandoffQuery, TIER } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { requireTier } from "../../domain/tier/requireTier.js";
import { buildRoleHandoffReport } from "../../domain/reporting/roleHandoff.js";
import { hasReportCapability } from "../../domain/policy/reportAccess.js";
import { insertAuditEvent } from "../../domain/accounting/auditMiddleware.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };

const roleHandoffRouter = new Hono<{
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
roleHandoffRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /reports/role-handoff
roleHandoffRouter.get("/reports/role-handoff",
  zValidator("query", RoleHandoffQuery, (result, c) => {
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

    if (
      !(await hasReportCapability(db, communityId, userId, "report:export"))
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  },
  requireTier(createDb, TIER.scale),
  async (c) => {
    const { communityId, transitionId } = c.req.valid("query");
    const db = createDb(c.env);
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildRoleHandoffReport(db, communityId, transitionId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "Role handoff reports are supported only for treasurer and secretary roles."
      ) {
        await captureReportExportEvent(
          "report_export_failed",
          {
            community_id: communityId,
            failure_type: "unsupported_role",
            report_type: "role_handoff",
          },
          c.get("userId"),
          c.env,
        );
        return c.json({ error: error.message }, 422);
      }
      throw error;
    }
    await insertAuditEvent(db, {
      communityId,
      actorUserId: c.get("userId"),
      action: "create",
      entityType: "report_export",
      entityId: `role-handoff-${transitionId}`,
    });
    await captureReportExportEvent(
      "report_export_downloaded",
      {
        community_id: communityId,
        report_type: "role_handoff",
      },
      c.get("userId"),
      c.env,
    );

    return c.body(pdfBytes.buffer as ArrayBuffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="role-handoff-${transitionId}.pdf"`,
    });
  },
);

export default roleHandoffRouter;
