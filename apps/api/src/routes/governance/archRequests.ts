import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  createArchRequestInput,
  reviewArchRequestInput,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { archRequests } from "../../db/schema/governance.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import { homeowners, unitOwnerships, units } from "../../db/schema/dues.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import {
  validateUploadContentType,
  buildR2Key,
  MAX_UPLOAD_BYTES,
  sniffUploadType,
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
          eq(units.active, true),
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
          eq(homeowners.active, true),
        ),
      );
    if (!homeowner) return { error: "Homeowner not found" };
  }

  if (input.unitId && input.homeownerId) {
    const today = new Date().toISOString().slice(0, 10);
    const [ownership] = await db
      .select({ id: unitOwnerships.id })
      .from(unitOwnerships)
      .where(
        and(
          eq(unitOwnerships.unitId, input.unitId),
          eq(unitOwnerships.homeownerId, input.homeownerId),
          lte(unitOwnerships.startDate, today),
          or(
            isNull(unitOwnerships.endDate),
            gte(unitOwnerships.endDate, today),
          ),
        ),
      );
    if (!ownership) return { error: "Homeowner does not own unit" };
  }

  return null;
}

router.get("/governance/arch-requests", async (c) => {
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
    .from(archRequests)
    .where(eq(archRequests.communityId, communityId))
    .orderBy(desc(archRequests.createdAt));
  return c.json({ archRequests: rows });
});

router.post(
  "/governance/arch-requests",
  zValidator("json", createArchRequestInput),
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
      .insert(archRequests)
      .values({
        id: nanoid(),
        communityId: data.communityId,
        unitId: data.unitId ?? null,
        homeownerId: data.homeownerId ?? null,
        requestType: data.requestType,
        description: data.description,
        status: "pending",
      })
      .returning();
    await captureGovernanceEvent(
      "governance_item_created",
      {
        community_id: data.communityId,
        item_id: row.id,
        item_type: "arch_request",
        status: row.status,
        has_unit: Boolean(data.unitId),
        has_homeowner: Boolean(data.homeownerId),
        role: membership.role,
      },
      c.get("userId"),
      c.env,
    );
    return c.json({ archRequest: row }, 201);
  },
);

router.patch(
  "/governance/arch-requests/:id/review",
  zValidator("json", reviewArchRequestInput),
  async (c) => {
    const id = c.req.param("id");
    const { status, reviewNote } = c.req.valid("json");
    const db = createDb(c.env);
    const [existing] = await db
      .select()
      .from(archRequests)
      .where(eq(archRequests.id, id));
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
    if (existing.status !== "pending")
      return c.json({ error: "Already reviewed" }, 409);
    // Re-check status atomically in the WHERE clause so two concurrent reviews
    // cannot both pass the pending check above and both write a review /
    // emit a duplicate governance_item_reviewed event.
    const [updated] = await db
      .update(archRequests)
      .set({
        status,
        reviewNote: reviewNote ?? null,
        reviewedByUserId: c.get("userId"),
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(archRequests.id, id), eq(archRequests.status, "pending")))
      .returning();
    if (!updated) return c.json({ error: "Already reviewed" }, 409);
    await captureGovernanceEvent(
      "governance_item_reviewed",
      {
        community_id: existing.communityId,
        item_id: id,
        item_type: "arch_request",
        previous_status: existing.status,
        role: membership.role,
        status,
      },
      c.get("userId"),
      c.env,
    );
    return c.json({ archRequest: updated });
  },
);

router.post("/governance/arch-requests/:id/attachments", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);
  const [existing] = await db
    .select()
    .from(archRequests)
    .where(eq(archRequests.id, id));
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

  // Once an arch request is reviewed (any non-pending status), the decision is
  // final — block attachment uploads before storing anything so evidence cannot
  // be added after the board has approved/denied it. Mirrors the review
  // endpoint's "Already reviewed" guard.
  if (existing.status !== "pending") {
    return c.json({ error: "Already reviewed" }, 409);
  }

  const contentType = c.req.header("content-type") ?? "";
  const baseType = contentType.split(";")[0].trim();
  if (!validateUploadContentType(baseType)) {
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
  const sniffed = sniffUploadType(body);
  if (!sniffed) {
    return c.json({ error: "Unsupported file type" }, 415);
  }
  const { ext, mimeType } = sniffed;
  const filename = `${nanoid()}.${ext}`;
  const key = buildR2Key(existing.communityId, "arch-requests", id, filename);
  if (!c.env.GOVERNANCE_BUCKET) {
    return c.json({ error: "Storage not configured" }, 503);
  }
  await c.env.GOVERNANCE_BUCKET.put(key, body, {
    httpMetadata: { contentType: mimeType },
  });

  // Atomic append: use array_append so concurrent uploads do not clobber each
  // other. The attachmentKeys column is text[] in Postgres, which supports
  // array_append natively. A plain JS read-modify-write outside a transaction
  // would cause the second concurrent upload to overwrite the first.
  const [updated] = await db
    .update(archRequests)
    .set({
      attachmentKeys: sql`array_append(coalesce(${archRequests.attachmentKeys}, ARRAY[]::text[]), ${key})`,
      updatedAt: new Date(),
    })
    .where(eq(archRequests.id, id))
    .returning();
  await captureGovernanceEvent(
    "governance_attachment_uploaded",
    {
      attachment_type: "arch_request",
      community_id: existing.communityId,
      file_type: mimeType,
      item_id: id,
      role: membership.role,
      size_bucket: uploadSizeBucket(body.byteLength),
    },
    c.get("userId"),
    c.env,
  );
  return c.json({ key, archRequest: updated }, 201);
});

export default router;
