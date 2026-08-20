import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import {
  createViolationInput,
  updateViolationStatusInput,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { violations, violationEvents } from "../../db/schema/governance.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import { homeowners, unitOwnerships, units } from "../../db/schema/dues.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { isValidTransition } from "../../domain/governance/violationWorkflow.js";
import {
  validateUploadContentType,
  buildR2Key,
  MAX_UPLOAD_BYTES,
  sniffUploadType,
  IMAGE_CONTENT_TYPES,
} from "../../domain/governance/fileUpload.js";
import { assertFeatureTier } from "../../domain/policy/access.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };
const router = new Hono<{ Bindings: Env; Variables: Variables }>();
const WRITE_ROLES = ["owner", "admin", "secretary"] as const;

function uploadSizeBucket(byteLength: number): "small" | "medium" | "large" {
  if (byteLength < 1024 * 1024) return "small";
  if (byteLength < 5 * 1024 * 1024) return "medium";
  return "large";
}

async function captureGovernanceEvent(
  name: string,
  properties: Record<string, unknown>,
  userId: string,
  env: Env,
): Promise<void> {
  try {
    await captureEvent(name, properties, userId, env);
  } catch {
    // Analytics is best-effort and must not break governance writes.
  }
}

router.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

async function requireMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
  const [m] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );
  if (!m) throw new Error("forbidden");
}

async function requireWriteMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
  const [m] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );
  if (!m || !(WRITE_ROLES as readonly string[]).includes(m.role)) {
    throw new Error("forbidden");
  }
  return m;
}

async function validateCommunityReferences(
  db: ReturnType<typeof createDb>,
  input: { communityId: string; unitId?: string; homeownerId?: string },
) {
  if (input.unitId) {
    const [unit] = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.id, input.unitId),
          eq(units.communityId, input.communityId),
        ),
      );
    if (!unit) return { error: "Unit not found" };
  }

  if (input.homeownerId) {
    const [homeowner] = await db
      .select({ id: homeowners.id })
      .from(homeowners)
      .where(
        and(
          eq(homeowners.id, input.homeownerId),
          eq(homeowners.communityId, input.communityId),
        ),
      );
    if (!homeowner) return { error: "Homeowner not found" };
  }

  if (input.unitId && input.homeownerId) {
    const [ownership] = await db
      .select({ id: unitOwnerships.id })
      .from(unitOwnerships)
      .where(
        and(
          eq(unitOwnerships.unitId, input.unitId),
          eq(unitOwnerships.homeownerId, input.homeownerId),
        ),
      );
    if (!ownership) return { error: "Homeowner does not own unit" };
  }

  return null;
}

router.get("/governance/violations", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId required" }, 400);
  const db = createDb(c.env);
  try {
    await requireMembership(db, communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, communityId, "governance-workflows");
  const rows = await db
    .select()
    .from(violations)
    .where(eq(violations.communityId, communityId))
    .orderBy(desc(violations.createdAt));
  return c.json({ violations: rows });
});

router.post(
  "/governance/violations",
  zValidator("json", createViolationInput),
  async (c) => {
    const data = c.req.valid("json");
    const db = createDb(c.env);
    let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
    try {
      membership = await requireWriteMembership(
        db,
        data.communityId,
        c.get("userId"),
      );
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }
    await assertFeatureTier(db, data.communityId, "governance-workflows");

    const referenceError = await validateCommunityReferences(db, data);
    if (referenceError) {
      return c.json(
        referenceError,
        referenceError.error.includes("does not own") ? 400 : 404,
      );
    }

    const [row] = await db
      .insert(violations)
      .values({
        id: nanoid(),
        communityId: data.communityId,
        unitId: data.unitId ?? null,
        homeownerId: data.homeownerId ?? null,
        title: data.title,
        description: data.description,
        createdByUserId: c.get("userId"),
        status: "open",
      })
      .returning();

    await db.insert(violationEvents).values({
      id: nanoid(),
      violationId: row.id,
      communityId: data.communityId,
      toStatus: "open",
      actorUserId: c.get("userId"),
    });

    await captureGovernanceEvent(
      "governance_item_created",
      {
        community_id: data.communityId,
        item_id: row.id,
        item_type: "violation",
        status: row.status,
        has_unit: Boolean(data.unitId),
        has_homeowner: Boolean(data.homeownerId),
        role: membership.role,
      },
      c.get("userId"),
      c.env,
    );

    return c.json({ violation: row }, 201);
  },
);

router.patch(
  "/governance/violations/:id/status",
  zValidator("json", updateViolationStatusInput),
  async (c) => {
    const violationId = c.req.param("id");
    const { status, note } = c.req.valid("json");
    const db = createDb(c.env);

    const [existing] = await db
      .select()
      .from(violations)
      .where(eq(violations.id, violationId));
    if (!existing) return c.json({ error: "Not found" }, 404);

    let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
    try {
      membership = await requireWriteMembership(
        db,
        existing.communityId,
        c.get("userId"),
      );
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }
    await assertFeatureTier(db, existing.communityId, "governance-workflows");

    const fromStatus = existing.status as
      | "open"
      | "notified"
      | "cured"
      | "closed";
    const toStatus = status as "open" | "notified" | "cured" | "closed";
    if (!isValidTransition(fromStatus, toStatus)) {
      return c.json(
        { error: `Invalid transition: ${fromStatus} → ${toStatus}` },
        422,
      );
    }

    // Re-check the from-status atomically in the WHERE clause. The transaction
    // alone gives atomicity of the update + event insert but not isolation
    // against a concurrent transition (READ COMMITTED lets two requests both
    // read the same fromStatus and both pass isValidTransition). Without the
    // status guard, both UPDATEs would apply (last-writer-wins) and each would
    // insert a violationEvents row + emit a duplicate analytics event. The
    // loser now matches zero rows and skips the event entirely.
    const [updated] = await db.transaction(async (tx) => {
      const result = await tx
        .update(violations)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(violations.id, violationId),
            eq(violations.status, fromStatus),
          ),
        )
        .returning();
      if (result.length === 0) return result;
      await tx.insert(violationEvents).values({
        id: nanoid(),
        violationId,
        communityId: existing.communityId,
        toStatus,
        note: note ?? null,
        actorUserId: c.get("userId"),
      });
      return result;
    });
    if (!updated) {
      // The row's status changed between our pre-check and the conditional
      // UPDATE (a concurrent writer won the race), so the transition we
      // validated no longer applies. This is distinct from the 422 returned
      // above for a transition that was invalid to begin with.
      return c.json(
        { error: "Violation status changed since this request — please retry" },
        409,
      );
    }
    await captureGovernanceEvent(
      "governance_violation_status_updated",
      {
        community_id: existing.communityId,
        from_status: fromStatus,
        role: membership.role,
        to_status: toStatus,
        violation_id: violationId,
      },
      c.get("userId"),
      c.env,
    );

    return c.json({ violation: updated });
  },
);

router.get("/governance/violations/:id/events", async (c) => {
  const violationId = c.req.param("id");
  const db = createDb(c.env);
  const [existing] = await db
    .select()
    .from(violations)
    .where(eq(violations.id, violationId));
  if (!existing) return c.json({ error: "Not found" }, 404);
  try {
    await requireMembership(db, existing.communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, existing.communityId, "governance-workflows");
  const events = await db
    .select()
    .from(violationEvents)
    .where(eq(violationEvents.violationId, violationId))
    .orderBy(asc(violationEvents.occurredAt), asc(violationEvents.id));
  return c.json({ events });
});

router.post("/governance/violations/:id/photos", async (c) => {
  const violationId = c.req.param("id");
  const db = createDb(c.env);
  const [existing] = await db
    .select()
    .from(violations)
    .where(eq(violations.id, violationId));
  if (!existing) return c.json({ error: "Not found" }, 404);
  let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
  try {
    membership = await requireWriteMembership(
      db,
      existing.communityId,
      c.get("userId"),
    );
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, existing.communityId, "governance-workflows");

  // A closed violation is a terminal, immutable audit record (no transitions out
  // of "closed"). Block photo uploads before storing anything so the evidentiary
  // record cannot be altered after closure. Mirrors the finalized-record guards
  // on meeting minutes and bank reconciliations.
  if (existing.status === "closed") {
    return c.json({ error: "Cannot add photos to a closed violation" }, 409);
  }

  const contentType = c.req.header("content-type") ?? "";
  const baseType = contentType.split(";")[0].trim();
  // Violation photos are image-only — reject PDFs and other document types.
  if (!validateUploadContentType(baseType, IMAGE_CONTENT_TYPES)) {
    return c.json({ error: "Unsupported file type" }, 415);
  }

  // Reject before reading the body when the declared Content-Length exceeds
  // the cap. This prevents the Worker from buffering a huge upload into memory.
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "File too large" }, 413);
  }

  const body = await c.req.arrayBuffer();

  // Enforce the cap on actual bytes read (guards against missing/spoofed header).
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "File too large" }, 413);
  }

  // Derive type from magic bytes — do not trust the client-supplied header.
  // Restrict to images so a %PDF body cannot be stored as a violation photo.
  const sniffed = sniffUploadType(body, IMAGE_CONTENT_TYPES);
  if (!sniffed) {
    return c.json({ error: "Unsupported file type" }, 415);
  }
  const { ext, mimeType } = sniffed;
  const filename = `${nanoid()}.${ext}`;
  const key = buildR2Key(
    existing.communityId,
    "violations",
    violationId,
    filename,
  );

  if (!c.env.GOVERNANCE_BUCKET) {
    return c.json({ error: "Storage not configured" }, 503);
  }
  await c.env.GOVERNANCE_BUCKET.put(key, body, {
    httpMetadata: { contentType: mimeType },
  });

  const [updated] = await db
    .update(violations)
    .set({
      photoKeys: sql`coalesce(${violations.photoKeys}, ARRAY[]::text[]) || ARRAY[${key}]::text[]`,
      updatedAt: new Date(),
    })
    .where(eq(violations.id, violationId))
    .returning();
  await captureGovernanceEvent(
    "governance_photo_uploaded",
    {
      community_id: existing.communityId,
      file_type: mimeType,
      role: membership.role,
      size_bucket: uploadSizeBucket(body.byteLength),
      violation_id: violationId,
    },
    c.get("userId"),
    c.env,
  );

  return c.json({ key, violation: updated }, 201);
});

export default router;
