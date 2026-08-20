import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, inArray } from "drizzle-orm";
import {
  ROLE_PERMISSIONS,
  createCommunityInput,
  communitySetupInput,
  inviteMemberInput,
  type BoardRole,
  roleCan,
  tierAllowsFeature,
} from "@boardstack/shared";
import { createDb } from "../db/client.js";
import {
  communities,
  communityMembers,
  invitations,
  communityActivation,
  subscriptions,
  boardTransitions,
} from "../db/schema/index.js";
import type { Env } from "../types/env.js";
import { getAuth } from "../lib/auth.js";
import { nanoid } from "../lib/nanoid.js";
import { captureEvent } from "../lib/observability.js";
import { checkRateLimit } from "../lib/rateLimiter.js";
import {
  assertBoardUserLimit,
  getCommunityTierResult,
  requireCapability,
} from "../domain/policy/access.js";
import { acquireXactLock, seatLockKey } from "../domain/policy/locks.js";
import { insertDefaultChartOfAccounts } from "../domain/accounting/seed.js";
import { buildTransitionChecklist } from "../domain/governance/boardTransition.js";

type Variables = { userId: string };

const communitiesRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

const COMMUNITY_UPDATE_ROLES = Object.entries(ROLE_PERMISSIONS)
  .filter(([, permissions]) => permissions.includes("community:update"))
  .map(([role]) => role as BoardRole);

type TransitionTx = Pick<ReturnType<typeof createDb>, "select">;

async function findOutgoingUserForTransition(
  tx: TransitionTx,
  communityId: string,
  role: BoardRole,
  incomingUserId: string,
): Promise<string | null> {
  const [outgoing] = await tx
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.role, role),
      ),
    )
    .limit(1);

  return outgoing?.userId && outgoing.userId !== incomingUserId
    ? outgoing.userId
    : null;
}

async function hasActiveTransitionForRole(
  tx: TransitionTx,
  communityId: string,
  role: BoardRole,
): Promise<boolean> {
  const rows = await tx
    .select({ status: boardTransitions.status })
    .from(boardTransitions)
    .where(
      and(
        eq(boardTransitions.communityId, communityId),
        eq(boardTransitions.role, role),
      ),
    );

  return rows.some((row) => row.status !== "complete");
}

// Middleware: require auth session on community + invitation routes only.
// Intentionally NOT"/*" to avoid leaking 401 to auth-library paths like
// /api/auth/* which are handled by a separate router in the main app.
communitiesRouter.use("/communities", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});
communitiesRouter.use("/communities/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});
communitiesRouter.use("/invitations/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

communitiesRouter.get("/communities/me", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env);
  const memberships = await db
    .select({ community: communities, role: communityMembers.role })
    .from(communityMembers)
    .innerJoin(communities, eq(communityMembers.communityId, communities.id))
    .where(eq(communityMembers.userId, userId));
  return c.json({ communities: memberships });
});

communitiesRouter.post(
  "/communities",
  zValidator("json", createCommunityInput),
  async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const db = createDb(c.env);
    const communityId = nanoid();

    await db.transaction(async (tx) => {
      await tx
        .insert(communities)
        .values({ id: communityId, ...data, ownerUserId: userId });
      await tx
        .insert(communityMembers)
        .values({ id: nanoid(), communityId, userId, role: "owner" });
      await tx.insert(subscriptions).values({
        id: nanoid(),
        communityId,
        status: "pending_trial",
        tier: "starter",
      });
      await tx
        .insert(communityActivation)
        .values({ id: nanoid(), communityId });
      await insertDefaultChartOfAccounts(tx, communityId);
    });

    await captureEvent(
      "community_created",
      {
        community_id: communityId,
        role: "owner",
        tier: "starter",
      },
      userId,
      c.env,
    );

    return c.json({ communityId }, 201);
  },
);

communitiesRouter.patch(
  "/communities/setup",
  zValidator("json", communitySetupInput),
  async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const db = createDb(c.env);

    const rows = await db
      .select({ community: communities, role: communityMembers.role })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(
        and(
          eq(communityMembers.userId, userId),
          ...(data.communityId === undefined
            ? [inArray(communityMembers.role, COMMUNITY_UPDATE_ROLES)]
            : []),
          ...(data.communityId !== undefined
            ? [eq(communityMembers.communityId, data.communityId)]
            : []),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "Community not found" }, 404);
    }

    const editableCommunity = rows.find((row) =>
      roleCan(row.role as BoardRole, "community:update"),
    );
    if (!editableCommunity) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const communityId = editableCommunity.community.id;
    const updates: { name?: string; state?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.state !== undefined) updates.state = data.state;

    await db
      .update(communities)
      .set(updates)
      .where(eq(communities.id, communityId));

    return c.json({ ok: true });
  },
);

communitiesRouter.post(
  "/communities/:id/invitations",
  zValidator("json", inviteMemberInput),
  async (c) => {
    const communityId = c.req.param("id");
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const db = createDb(c.env);

    try {
      await requireCapability(db, communityId, userId, "member:invite");
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Per-community invitation rate limit: 50 invitations per day
    const inviteLimit = await checkRateLimit({
      kv: c.env.AUTH_RATE_LIMIT_KV,
      namespace: "invite-community",
      identifier: communityId,
      maxRequests: 50,
      windowSeconds: 24 * 60 * 60,
    });
    if (!inviteLimit.allowed) {
      try {
        await captureEvent(
          "member_invite_failed",
          {
            community_id: communityId,
            failure_reason: "rate_limited",
            role: data.role,
          },
          userId,
          c.env,
        );
      } catch {
        // Analytics is best-effort and must not break invitation failures.
      }
      return c.json(
        {
          error:
            "Invitation limit reached. Maximum 50 invitations per day per community.",
        },
        429,
      );
    }

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.transaction(async (tx) => {
      // Serialize concurrent seat additions for this community so the
      // member+invitation count read below cannot race a sibling invite/accept
      // committing in between (the count is non-unique, so onConflict cannot
      // backstop it). Held until this transaction commits or rolls back.
      await acquireXactLock(tx, seatLockKey(communityId));
      await assertBoardUserLimit(tx, communityId, 1);
      await tx
        .insert(invitations)
        .values({ id: nanoid(), communityId, ...data, token, expiresAt });
    });
    try {
      await captureEvent(
        "member_invited",
        {
          community_id: communityId,
          role: data.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break invitations.
    }
    return c.json({ token }, 201);
  },
);

communitiesRouter.post("/invitations/:token/accept", async (c) => {
  const token = c.req.param("token");
  const userId = c.get("userId");
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const db = createDb(c.env);
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);
  if (!inv) return c.json({ error: "Invitation not found" }, 404);
  if (inv.consumedAt || inv.expiresAt < new Date())
    return c.json({ error: "Invitation expired or already used" }, 410);
  if (!session.user.emailVerified) {
    return c.json(
      {
        error: "Email address must be verified before accepting an invitation",
      },
      403,
    );
  }

  const invitationEmail = inv.email.trim().toLowerCase();
  const sessionEmail = session.user.email?.trim().toLowerCase();
  if (!sessionEmail || invitationEmail !== sessionEmail) {
    try {
      await captureEvent(
        "invitation_accept_failed",
        {
          community_id: inv.communityId,
          failure_reason: "email_mismatch",
          role: inv.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break invitation failures.
    }
    return c.json(
      { error: "This invitation is for a different email address" },
      403,
    );
  }
  let transitionCreated = false;
  try {
    await db.transaction(async (tx) => {
      // Serialize against concurrent invite-create/accept for this community so
      // the seat-cap count is consistent through the membership insert below.
      await acquireXactLock(tx, seatLockKey(inv.communityId));
      await assertBoardUserLimit(tx, inv.communityId, 0);
      const pendingItems = buildTransitionChecklist(inv.role);
      const shouldCreateTransition =
        pendingItems.length > 0 &&
        tierAllowsFeature(
          (
            await getCommunityTierResult(
              tx as unknown as typeof db,
              inv.communityId,
            )
          ).tier,
          "governance-workflows",
        ) &&
        !(await hasActiveTransitionForRole(
          tx as unknown as TransitionTx,
          inv.communityId,
          inv.role,
        ));
      const fromUserId = shouldCreateTransition
        ? await findOutgoingUserForTransition(
            tx as unknown as TransitionTx,
            inv.communityId,
            inv.role,
            userId,
          )
        : null;
      const insertedMemberships = await tx
        .insert(communityMembers)
        .values({
          id: nanoid(),
          communityId: inv.communityId,
          userId,
          role: inv.role,
          acceptedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: communityMembers.id });

      if (insertedMemberships.length === 0) {
        throw new Error("MEMBERSHIP_EXISTS");
      }

      if (shouldCreateTransition) {
        await tx
          .insert(boardTransitions)
          .values({
            id: nanoid(),
            communityId: inv.communityId,
            role: inv.role,
            fromUserId,
            toUserId: userId,
            status: "pending",
            pendingItems,
          })
          .onConflictDoNothing();
        transitionCreated = true;
      }

      await tx
        .update(invitations)
        .set({ consumedAt: new Date() })
        .where(eq(invitations.token, token));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBERSHIP_EXISTS") {
      return c.json(
        { error: "You are already a member of this community" },
        409,
      );
    }
    throw error;
  }

  try {
    await captureEvent(
      "invitation_accept_completed",
      {
        community_id: inv.communityId,
        role: inv.role,
        transition_created: transitionCreated,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break invitation acceptance.
  }

  return c.json({ ok: true });
});

export default communitiesRouter;
