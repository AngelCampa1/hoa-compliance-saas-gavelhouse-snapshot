import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import {
  createMeetingInput,
  updateMeetingMinutesInput,
  createMotionInput,
  resolveMotionInput,
  castVoteInput,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { meetings, motions, votes } from "../../db/schema/governance.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { assertFeatureTier } from "../../domain/policy/access.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };
const router = new Hono<{ Bindings: Env; Variables: Variables }>();
const WRITE_ROLES = ["owner", "admin", "secretary"] as const;

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
  return m;
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

router.get("/governance/meetings", async (c) => {
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
    .from(meetings)
    .where(eq(meetings.communityId, communityId))
    .orderBy(desc(meetings.scheduledAt));
  return c.json({ meetings: rows });
});

router.post(
  "/governance/meetings",
  zValidator("json", createMeetingInput),
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
    const [row] = await db
      .insert(meetings)
      .values({
        id: nanoid(),
        ...data,
        scheduledAt: new Date(data.scheduledAt),
        createdByUserId: c.get("userId"),
      })
      .returning();
    await captureGovernanceEvent(
      "governance_item_created",
      {
        community_id: data.communityId,
        item_id: row.id,
        item_type: "meeting",
        meeting_type: data.meetingType,
        scheduled_month: data.scheduledAt.slice(0, 7),
        role: membership.role,
      },
      c.get("userId"),
      c.env,
    );
    return c.json({ meeting: row }, 201);
  },
);

router.patch(
  "/governance/meetings/:id/minutes",
  zValidator("json", updateMeetingMinutesInput),
  async (c) => {
    const id = c.req.param("id");
    const { minutesText, finalize } = c.req.valid("json");
    const db = createDb(c.env);
    const [existing] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, id));
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
    if (existing.minutesFinalizedAt) {
      return c.json({ error: "Minutes already finalized" }, 409);
    }
    const [updated] = await db
      .update(meetings)
      .set({
        minutesText,
        minutesFinalizedAt: finalize ? new Date() : existing.minutesFinalizedAt,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id))
      .returning();
    const analyticsProperties = {
      community_id: existing.communityId,
      finalized: Boolean(finalize),
      meeting_id: id,
      role: membership.role,
    };
    await captureGovernanceEvent(
      "governance_minutes_updated",
      analyticsProperties,
      c.get("userId"),
      c.env,
    );
    if (finalize) {
      await captureGovernanceEvent(
        "governance_minutes_finalized",
        {
          community_id: existing.communityId,
          meeting_id: id,
          role: membership.role,
        },
        c.get("userId"),
        c.env,
      );
    }
    return c.json({ meeting: updated });
  },
);

router.get("/governance/meetings/:id/motions", async (c) => {
  const meetingId = c.req.param("id");
  const db = createDb(c.env);
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  if (!meeting) return c.json({ error: "Not found" }, 404);
  try {
    await requireMembership(db, meeting.communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, meeting.communityId, "governance-workflows");
  const rows = await db
    .select()
    .from(motions)
    .where(eq(motions.meetingId, meetingId));
  return c.json({ motions: rows });
});

router.post(
  "/governance/meetings/:id/motions",
  zValidator("json", createMotionInput),
  async (c) => {
    const meetingId = c.req.param("id");
    const data = c.req.valid("json");
    const db = createDb(c.env);
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));
    if (!meeting) return c.json({ error: "Not found" }, 404);
    let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
    try {
      membership = await requireWriteMembership(
        db,
        meeting.communityId,
        c.get("userId"),
      );
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }
    await assertFeatureTier(db, meeting.communityId, "governance-workflows");
    const [row] = await db
      .insert(motions)
      .values({
        id: nanoid(),
        meetingId,
        communityId: meeting.communityId,
        text: data.text,
        movedByUserId: data.movedByUserId ?? null,
        secondedByUserId: data.secondedByUserId ?? null,
        status: "pending",
      })
      .returning();
    await captureGovernanceEvent(
      "governance_motion_created",
      {
        community_id: meeting.communityId,
        meeting_id: meetingId,
        motion_id: row.id,
        role: membership.role,
      },
      c.get("userId"),
      c.env,
    );
    return c.json({ motion: row }, 201);
  },
);

router.patch(
  "/governance/motions/:id/resolve",
  zValidator("json", resolveMotionInput),
  async (c) => {
    const id = c.req.param("id");
    const { status } = c.req.valid("json");
    const db = createDb(c.env);
    const [motion] = await db.select().from(motions).where(eq(motions.id, id));
    if (!motion) return c.json({ error: "Not found" }, 404);
    let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
    try {
      membership = await requireWriteMembership(
        db,
        motion.communityId,
        c.get("userId"),
      );
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }
    await assertFeatureTier(db, motion.communityId, "governance-workflows");
    if (motion.status !== "pending") {
      return c.json({ error: "Motion already resolved" }, 409);
    }
    // Re-check status atomically in the WHERE clause so two concurrent
    // resolves cannot both pass the pending check above and both write a
    // resolution / emit a duplicate governance_motion_resolved event.
    const [updated] = await db
      .update(motions)
      .set({
        status,
        resolvedAt: new Date(),
      })
      .where(and(eq(motions.id, id), eq(motions.status, "pending")))
      .returning();
    if (!updated) {
      return c.json({ error: "Motion already resolved" }, 409);
    }
    await captureGovernanceEvent(
      "governance_motion_resolved",
      {
        community_id: motion.communityId,
        meeting_id: motion.meetingId,
        motion_id: id,
        role: membership.role,
        status,
      },
      c.get("userId"),
      c.env,
    );
    return c.json({ motion: updated });
  },
);

router.post(
  "/governance/motions/:id/votes",
  zValidator("json", castVoteInput),
  async (c) => {
    const motionId = c.req.param("id");
    const { choice, notes } = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);
    const [motion] = await db
      .select()
      .from(motions)
      .where(eq(motions.id, motionId));
    if (!motion) return c.json({ error: "Not found" }, 404);
    let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
    try {
      membership = await requireWriteMembership(db, motion.communityId, userId);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }
    await assertFeatureTier(db, motion.communityId, "governance-workflows");
    if (motion.status !== "pending") {
      return c.json({ error: "Motion is not open for voting" }, 409);
    }
    const existing = await db
      .select()
      .from(votes)
      .where(and(eq(votes.motionId, motionId), eq(votes.voterUserId, userId)));
    if (existing.length > 0) return c.json({ error: "Already voted" }, 409);
    // The pre-check above closes the common case, but two concurrent votes from
    // the same user can both pass it. The votes_motion_voter_unique index is the
    // real guard: onConflictDoNothing makes the race loser return no row instead
    // of throwing a raw unique-violation (which would surface as a 500), so we
    // can map it to a clean 409 with no duplicate governance_vote_cast event.
    const [row] = await db
      .insert(votes)
      .values({
        id: nanoid(),
        motionId,
        communityId: motion.communityId,
        voterUserId: userId,
        choice,
        notes: notes ?? null,
      })
      .onConflictDoNothing({
        target: [votes.motionId, votes.voterUserId],
      })
      .returning();
    if (!row) return c.json({ error: "Already voted" }, 409);
    await captureGovernanceEvent(
      "governance_vote_cast",
      {
        choice,
        community_id: motion.communityId,
        meeting_id: motion.meetingId,
        motion_id: motionId,
        role: membership.role,
        vote_id: row.id,
      },
      userId,
      c.env,
    );
    return c.json({ vote: row }, 201);
  },
);

router.get("/governance/motions/:id/votes", async (c) => {
  const motionId = c.req.param("id");
  const db = createDb(c.env);
  const [motion] = await db
    .select()
    .from(motions)
    .where(eq(motions.id, motionId));
  if (!motion) return c.json({ error: "Not found" }, 404);
  try {
    await requireMembership(db, motion.communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }
  await assertFeatureTier(db, motion.communityId, "governance-workflows");
  const rows = await db
    .select()
    .from(votes)
    .where(eq(votes.motionId, motionId));
  const tally = rows.reduce(
    (acc, v) => {
      acc[v.choice] = (acc[v.choice] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return c.json({ votes: rows, tally });
});

export default router;
