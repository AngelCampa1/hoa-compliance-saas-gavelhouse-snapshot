import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import {
  AdvanceChecklistInput,
  StartCloseInput,
  CLOSE_STEPS,
  roleCan,
  type BoardRole,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  monthEndCloses,
  closeChecklistItems,
} from "../../db/schema/monthEndClose.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent } from "../../lib/observability.js";
import {
  buildChecklistItems,
  allCompleted,
} from "../../domain/monthEndClose/checklist.js";
import { buildAuditPack } from "../../domain/reporting/auditPack.js";
import { assertFeatureTier } from "../../domain/policy/access.js";
import { acquireXactLock, closeLockKey } from "../../domain/policy/locks.js";

type Variables = { userId: string };

const closeRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;

// ── Auth middleware ──────────────────────────────────────────────────────────
closeRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function requireWriteMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
): Promise<{ role: string } | null> {
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

  if (!membership) return null;
  if (!(WRITE_ROLES as readonly string[]).includes(membership.role))
    return null;
  return membership;
}

async function requireMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
): Promise<{ role: string } | null> {
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

  return membership ?? null;
}

async function collectStreamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ── POST /close/start ────────────────────────────────────────────────────────
closeRouter.post(
  "/close/start",
  zValidator("json", StartCloseInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const membership = await requireWriteMembership(
      db,
      data.communityId,
      userId,
    );
    if (!membership) return c.json({ error: "Forbidden" }, 403);
    await assertFeatureTier(db, data.communityId, "month-end-close");

    // Idempotency check
    const [existing] = await db
      .select()
      .from(monthEndCloses)
      .where(
        and(
          eq(monthEndCloses.communityId, data.communityId),
          eq(monthEndCloses.periodYear, data.periodYear),
          eq(monthEndCloses.periodMonth, data.periodMonth),
        ),
      )
      .limit(1);

    if (existing) {
      const items = await db
        .select()
        .from(closeChecklistItems)
        .where(eq(closeChecklistItems.closeId, existing.id));

      return c.json({
        closeId: existing.id,
        steps: items.map((i) => ({ step: i.step, completed: i.completed })),
      });
    }

    // Create new close — both inserts in a transaction so checklist items
    // always exist when the close record is visible.
    const closeId = nanoid();
    const [newClose] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(monthEndCloses)
        .values({
          id: closeId,
          communityId: data.communityId,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
          status: "open",
        })
        .returning();
      const checklistItems = buildChecklistItems(closeId, data.communityId);
      await tx.insert(closeChecklistItems).values(checklistItems);
      return [created];
    });

    try {
      await captureEvent(
        "close_started",
        {
          close_id: newClose.id,
          community_id: data.communityId,
          period_month: data.periodMonth,
          period_year: data.periodYear,
          role: membership.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break close creation.
    }

    return c.json({
      closeId: newClose.id,
      steps: CLOSE_STEPS.map((step) => ({ step, completed: false })),
    });
  },
);

// ── PATCH /close/:id/steps/:step ─────────────────────────────────────────────
closeRouter.patch("/close/:id/steps/:step", async (c) => {
  const closeId = c.req.param("id");
  const stepParam = c.req.param("step");
  const userId = c.get("userId");

  // Validate step
  const stepParse = z.enum(CLOSE_STEPS).safeParse(stepParam);
  if (!stepParse.success) {
    return c.json({ error: "Invalid step", validSteps: CLOSE_STEPS }, 400);
  }
  const step = stepParse.data;

  let data: AdvanceChecklistInput;
  try {
    const body = await c.req.json();
    const parsed = AdvanceChecklistInput.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request body", issues: parsed.error.issues },
        400,
      );
    }
    data = parsed.data;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }
  if (data.closeId !== closeId) {
    return c.json({ error: "closeId must match path" }, 400);
  }
  if (data.step !== step) {
    return c.json({ error: "step must match path" }, 400);
  }

  const db = createDb(c.env);

  const membership = await requireWriteMembership(db, data.communityId, userId);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, data.communityId, "month-end-close");

  const now = new Date();
  const [updated] = await db
    .update(closeChecklistItems)
    .set({
      completed: data.completed,
      completedAt: data.completed ? now : null,
      completedByUserId: data.completed ? userId : null,
    })
    .where(
      and(
        eq(closeChecklistItems.closeId, closeId),
        eq(closeChecklistItems.communityId, data.communityId),
        eq(closeChecklistItems.step, step),
      ),
    )
    .returning();

  if (!updated) {
    return c.json({ error: "Checklist item not found" }, 404);
  }

  try {
    await captureEvent(
      "close_step_updated",
      {
        close_id: closeId,
        community_id: data.communityId,
        completed: updated.completed,
        role: membership.role,
        step: updated.step,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break checklist updates.
  }

  return c.json({ ok: true, step: updated.step, completed: updated.completed });
});

// ── POST /close/:id/complete ──────────────────────────────────────────────────
closeRouter.post("/close/:id/complete", async (c) => {
  const closeId = c.req.param("id");
  const userId = c.get("userId");

  let communityId: string;
  try {
    const body = await c.req.json<{ communityId: string }>();
    communityId = body.communityId;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const db = createDb(c.env);

  const membership = await requireWriteMembership(db, communityId, userId);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, communityId, "month-end-close");

  // Fetch the close record
  const [close] = await db
    .select()
    .from(monthEndCloses)
    .where(
      and(
        eq(monthEndCloses.id, closeId),
        eq(monthEndCloses.communityId, communityId),
      ),
    )
    .limit(1);

  if (!close) return c.json({ error: "Close not found" }, 404);

  // Completing a close is a one-way terminal transition. Guard against a
  // repeat call (retry / double-submit / second board member): re-running
  // would rebuild and re-upload the audit pack under a fresh R2 key —
  // orphaning the previously stored pack — overwrite completedAt, and
  // re-emit close_completed. Reject an already-complete close instead.
  if (close.status === "complete") {
    return c.json({ error: "Close is already complete" }, 409);
  }

  // Fetch checklist items
  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(eq(closeChecklistItems.closeId, closeId));

  if (!allCompleted(items)) {
    return c.json(
      { error: "Cannot complete close — not all steps are checked off" },
      422,
    );
  }

  // Build period dates from periodYear + periodMonth
  const year = close.periodYear;
  const month = String(close.periodMonth).padStart(2, "0");
  const periodStart = `${year}-${month}-01`;
  const lastDay = new Date(year, close.periodMonth, 0).getDate();
  const periodEnd = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

  // Write to R2 — binding is required; fail explicitly rather than silently
  // skipping the upload and recording a dead auditPackKey in the DB.
  if (!c.env.AUDIT_PACK_BUCKET) {
    return c.json(
      { error: "Audit pack storage is unavailable. Please contact support." },
      500,
    );
  }
  const bucket = c.env.AUDIT_PACK_BUCKET;

  // The pre-check above is a fast path only; it cannot prevent two concurrent
  // /complete calls from both passing it. Serialize the whole
  // recheck → build → upload → flip sequence under a per-close advisory lock
  // and re-read the status inside the lock. The loser observes a complete
  // close and bails out BEFORE building or uploading anything, so we never
  // orphan an R2 object or emit a duplicate close_completed event.
  const outcome = await db.transaction(async (tx) => {
    await acquireXactLock(tx, closeLockKey(closeId));

    const [locked] = await tx
      .select({ status: monthEndCloses.status })
      .from(monthEndCloses)
      .where(
        and(
          eq(monthEndCloses.id, closeId),
          eq(monthEndCloses.communityId, communityId),
        ),
      )
      .limit(1);

    if (!locked || locked.status === "complete") {
      return { conflict: true as const };
    }

    // The audit pack reads committed ledger data only; the advisory lock above
    // already serializes completion, so reading via the outer client is safe.
    const stream = await buildAuditPack(db, {
      communityId,
      periodStart,
      periodEnd,
    });
    const bytes = await collectStreamToUint8Array(stream);

    const key = `${communityId}/${year}-${month}/audit-pack-${nanoid()}.zip`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: "application/zip" },
    });

    const now = new Date();
    const [completed] = await tx
      .update(monthEndCloses)
      .set({
        status: "complete",
        completedAt: now,
        auditPackKey: key,
      })
      .where(
        and(
          eq(monthEndCloses.id, closeId),
          eq(monthEndCloses.communityId, communityId),
        ),
      )
      .returning();

    return { conflict: false as const, completed, bytes };
  });

  if (outcome.conflict) {
    return c.json({ error: "Close is already complete" }, 409);
  }
  const { completed, bytes } = outcome;

  try {
    await captureEvent(
      "close_completed",
      {
        audit_pack_bytes: bytes.byteLength,
        checklist_count: items.length,
        close_id: completed.id,
        community_id: communityId,
        period_month: close.periodMonth,
        period_year: close.periodYear,
        role: membership.role,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break close completion.
  }

  return c.json({
    closeId: completed.id,
    status: completed.status,
    auditPackKey: completed.auditPackKey,
  });
});

// ── GET /close/:id/pack-url ───────────────────────────────────────────────────
closeRouter.get("/close/:id/pack-url", async (c) => {
  const closeId = c.req.param("id");
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const membership = await requireMembership(db, communityId, userId);
  if (!membership || !roleCan(membership.role as BoardRole, "report:export")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, communityId, "month-end-close");

  const [close] = await db
    .select()
    .from(monthEndCloses)
    .where(
      and(
        eq(monthEndCloses.id, closeId),
        eq(monthEndCloses.communityId, communityId),
      ),
    )
    .limit(1);

  if (!close || !close.auditPackKey) {
    return c.json({ error: "Audit pack not found" }, 404);
  }

  const obj = await c.env.AUDIT_PACK_BUCKET?.get(close.auditPackKey);
  if (!obj) return c.json({ error: "Audit pack not found in storage" }, 404);

  const keyParts = close.auditPackKey.split("/");
  const filename = keyParts[keyParts.length - 1];

  try {
    await captureEvent(
      "audit_pack_downloaded",
      {
        close_id: close.id,
        community_id: communityId,
        period_month: close.periodMonth,
        period_year: close.periodYear,
        role: membership.role,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break audit pack downloads.
  }

  return c.body(obj.body, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

// ── GET /close/:id/checklist ──────────────────────────────────────────────────
closeRouter.get("/close/:id/checklist", async (c) => {
  const closeId = c.req.param("id");
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const membership = await requireMembership(db, communityId, userId);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, communityId, "month-end-close");

  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(
      and(
        eq(closeChecklistItems.closeId, closeId),
        eq(closeChecklistItems.communityId, communityId),
      ),
    );

  return c.json({
    items: items.map((i) => ({
      id: i.id,
      step: i.step,
      completed: i.completed,
      completedAt: i.completedAt,
    })),
  });
});

// ── GET /close ────────────────────────────────────────────────────────────────
closeRouter.get("/close", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const membership = await requireMembership(db, communityId, userId);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, communityId, "month-end-close");

  const closes = await db
    .select()
    .from(monthEndCloses)
    .where(eq(monthEndCloses.communityId, communityId))
    .orderBy(desc(monthEndCloses.periodYear), desc(monthEndCloses.periodMonth));

  return c.json({ closes });
});

export default closeRouter;
