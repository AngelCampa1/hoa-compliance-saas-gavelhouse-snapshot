import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../../db/client.js";
import { boardTransitions } from "../../db/schema/governance.js";
import { communityMembers } from "../../db/schema/index.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { assertFeatureTier } from "../../domain/policy/access.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

async function captureBoardTransitionEvent(
  name: "board_transition_acknowledged" | "board_transition_completed",
  properties: Record<string, unknown>,
  userId: string,
  env: Env,
) {
  try {
    await captureEvent(name, properties, userId, env);
  } catch {
    // Analytics should never block the governance workflow.
  }
}

router.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

router.get("/governance/transitions", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId required" }, 400);
  const db = createDb(c.env);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, c.get("userId")),
      ),
    );
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, communityId, "governance-workflows");

  const rows = await db
    .select()
    .from(boardTransitions)
    .where(eq(boardTransitions.communityId, communityId));
  return c.json({ transitions: rows });
});

router.patch("/governance/transitions/:id/acknowledge", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);

  const [transition] = await db
    .select()
    .from(boardTransitions)
    .where(eq(boardTransitions.id, id));
  if (!transition) return c.json({ error: "Not found" }, 404);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, transition.communityId),
        eq(communityMembers.userId, c.get("userId")),
      ),
    );
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, transition.communityId, "governance-workflows");

  if (transition.toUserId !== c.get("userId")) {
    return c.json(
      { error: "Only the incoming board member can acknowledge" },
      403,
    );
  }

  // Acknowledge is only valid from the initial "pending" state. Without this
  // guard a re-call would set an already-acknowledged transition again
  // (re-emitting the event) or — worse — regress a "complete" transition back
  // to "acknowledged", leaving status=acknowledged while completedAt stays set
  // and reopening a finished governance handoff. Mirror the /complete guard.
  if (transition.status !== "pending") {
    return c.json(
      { error: "Transition has already been acknowledged" },
      409,
    );
  }

  const [updated] = await db
    .update(boardTransitions)
    .set({ status: "acknowledged", updatedAt: new Date() })
    .where(eq(boardTransitions.id, id))
    .returning();
  await captureBoardTransitionEvent(
    "board_transition_acknowledged",
    {
      community_id: transition.communityId,
      transition_id: transition.id,
      transition_role: transition.role,
      previous_status: transition.status,
      new_status: "acknowledged",
      actor_role: membership.role,
      actor_position: "incoming",
    },
    c.get("userId"),
    c.env,
  );
  return c.json({ transition: updated });
});

router.patch("/governance/transitions/:id/complete", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);

  const [transition] = await db
    .select()
    .from(boardTransitions)
    .where(eq(boardTransitions.id, id));
  if (!transition) return c.json({ error: "Not found" }, 404);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, transition.communityId),
        eq(communityMembers.userId, c.get("userId")),
      ),
    );
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  await assertFeatureTier(db, transition.communityId, "governance-workflows");

  const allowedUsers = [transition.fromUserId, transition.toUserId].filter(
    Boolean,
  );
  if (!allowedUsers.includes(c.get("userId"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (transition.status !== "acknowledged") {
    return c.json(
      { error: "Transition must be acknowledged before completion" },
      409,
    );
  }

  // Re-check the status atomically in the UPDATE's WHERE clause so two
  // concurrent requests that both pass the pre-check above cannot both
  // transition the row to "complete" and emit a duplicate completion event.
  // The loser of the race updates zero rows and gets the same 409.
  const [updated] = await db
    .update(boardTransitions)
    .set({ status: "complete", completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(boardTransitions.id, id),
        eq(boardTransitions.status, "acknowledged"),
      ),
    )
    .returning();
  if (!updated) {
    return c.json(
      { error: "Transition must be acknowledged before completion" },
      409,
    );
  }
  await captureBoardTransitionEvent(
    "board_transition_completed",
    {
      community_id: transition.communityId,
      transition_id: transition.id,
      transition_role: transition.role,
      previous_status: transition.status,
      new_status: "complete",
      actor_role: membership.role,
      actor_position:
        c.get("userId") === transition.toUserId ? "incoming" : "outgoing",
    },
    c.get("userId"),
    c.env,
  );
  return c.json({ transition: updated });
});

export default router;
