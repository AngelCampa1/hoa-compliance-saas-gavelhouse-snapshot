import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import {
  FULL_TRIAL_TIER,
  getMinimumTierForFeature,
  getTierLimit,
  priceIdToTier,
  roleCan,
  tierAllowsFeature,
  type BoardRole,
  type RoleCapability,
  type Tier,
  type TierFeature,
} from "@boardstack/shared";
import type { Db, Env as DbEnv } from "../../db/client.js";
import { communities, communityMembers } from "../../db/schema/tenancy.js";
import { subscriptions } from "../../db/schema/billing.js";
import { units } from "../../db/schema/dues.js";
import { invitations } from "../../db/schema/tenancy.js";

/**
 * Structural subset of Db that is satisfied by both a full PostgresJsDatabase
 * and a PgTransaction. Functions that only need SELECT and can therefore run
 * safely inside a Drizzle transaction should use this type so callers can pass
 * `tx` from `db.transaction(async (tx) => {...})` without a cast.
 */
type SelectDb = Pick<Db, "select">;

type HonoContext = Context<{ Bindings: DbEnv; Variables: { userId: string } }>;

export async function getCommunityTier(
  db: SelectDb,
  communityId: string,
): Promise<Tier | null> {
  return (await getCommunityTierResult(db, communityId)).tier;
}

export type CommunityTierResult =
  | { found: true; tier: Tier | null }
  | { found: false; tier: null };

export async function getCommunityTierResult(
  db: SelectDb,
  communityId: string,
): Promise<CommunityTierResult> {
  const subResult = await db
    .select({
      tier: subscriptions.tier,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.communityId, communityId))
    .limit(1);
  const sub:
    | {
        tier?: Tier;
        status?: string;
        stripePriceId?: string | null;
        trialEndsAt?: Date | null;
        stripeSubscriptionId?: string | null;
      }
    | undefined = subResult[0];

  if (sub && "stripePriceId" in sub && !("status" in sub) && !("tier" in sub)) {
    return { found: true, tier: priceIdToTier(sub.stripePriceId) };
  }

  // A local (non-Stripe) trial only flips to "expired" via the once-daily
  // expireTrialsWithoutBillingSweep cron. The entitlement gate must not trust
  // the raw "trialing" status column: if the trial has lapsed but the sweep
  // has not run yet (or failed), fall through to the legacy price-id fallback
  // (which denies when there is no paid plan) instead of granting the full
  // trial tier. Mirrors normalizeSubscriptionStatus in routes/billing.ts.
  const isLapsedLocalTrial =
    !!sub &&
    sub.status === "trialing" &&
    sub.stripeSubscriptionId === null &&
    sub.trialEndsAt instanceof Date &&
    sub.trialEndsAt.getTime() <= Date.now();

  if (
    sub &&
    typeof sub.status === "string" &&
    sub.status === "trialing" &&
    !isLapsedLocalTrial
  ) {
    return { found: true, tier: FULL_TRIAL_TIER };
  }

  if (
    sub &&
    typeof sub.status === "string" &&
    sub.status === "active" &&
    sub.tier
  ) {
    return { found: true, tier: sub.tier };
  }

  const [community] = await db
    .select({ stripePriceId: communities.stripePriceId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) {
    return { found: false, tier: null };
  }
  if (!("stripePriceId" in community))
    return { found: true, tier: FULL_TRIAL_TIER };
  return { found: true, tier: priceIdToTier(community.stripePriceId) };
}

export async function getCommunityMembership(
  db: Db,
  communityId: string,
  userId: string,
) {
  const result = db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );
  const rows =
    typeof (result as { limit?: unknown }).limit === "function"
      ? await (
          result as { limit: (count: number) => Promise<unknown[]> }
        ).limit(1)
      : await (result as Promise<unknown[]>);
  const [membership] = rows as Array<{ role: string }>;

  return membership ?? null;
}

export async function requireCapability(
  db: Db,
  communityId: string,
  userId: string,
  capability: RoleCapability,
) {
  const membership = await getCommunityMembership(db, communityId, userId);
  if (!membership || !roleCan(membership.role as BoardRole, capability)) {
    throw new Error("forbidden");
  }
  return membership;
}

export function requireFeatureTier(
  createDb: (env: DbEnv) => Db,
  feature: TierFeature,
): MiddlewareHandler {
  return async (c, next) => {
    const communityId =
      c.req.query("communityId") ?? (await readCommunityId(c));
    if (!communityId) return c.json({ error: "communityId required" }, 400);
    const db = createDb(c.env as DbEnv);
    const tier = await getCommunityTier(db, communityId);
    if (!tierAllowsFeature(tier, feature)) {
      return c.json(
        {
          error: "upgrade_required",
          minimum: getMinimumTierForFeature(feature),
        },
        403,
      );
    }
    await next();
  };
}

export async function enforceFeatureTier(
  db: Db,
  communityId: string,
  feature: TierFeature,
): Promise<Response | null> {
  const tier = await getCommunityTier(db, communityId);
  if (tierAllowsFeature(tier, feature)) return null;
  return Response.json(
    { error: "upgrade_required", minimum: getMinimumTierForFeature(feature) },
    { status: 403 },
  );
}

export async function assertFeatureTier(
  db: Db,
  communityId: string,
  feature: TierFeature,
): Promise<void> {
  const response = await enforceFeatureTier(db, communityId, feature);
  if (response) throw new HTTPException(403, { res: response });
}

export async function enforceHomeLimit(
  db: SelectDb,
  communityId: string,
  additions: number,
): Promise<Response | null> {
  const tier = await getCommunityTier(db, communityId);
  const maximum = getTierLimit(tier, "homes");
  if (maximum === null) return null;

  const [row] = await db
    .select({ value: count() })
    .from(units)
    .where(and(eq(units.communityId, communityId), eq(units.active, true)));
  if ((row?.value ?? 0) + additions <= maximum) return null;

  return Response.json(
    { error: "limit_exceeded", limit: "homes", maximum },
    { status: 403 },
  );
}

/**
 * Re-checks the home limit and throws a 403 if exceeded. The count query must
 * run inside the same transaction as the inserts it guards. For a hard
 * guarantee against two simultaneously-open transactions (which READ COMMITTED
 * alone does not provide), callers acquire the per-community home advisory lock
 * (`acquireXactLock(tx, homeLockKey(communityId))`) as the first statement in
 * the transaction before calling this — that serializes all home-cap mutations
 * for the community so the count cannot race a sibling insert. See
 * `domain/policy/locks.ts`.
 */
export async function assertHomeLimit(
  db: SelectDb,
  communityId: string,
  additions: number,
): Promise<void> {
  const response = await enforceHomeLimit(db, communityId, additions);
  if (response) throw new HTTPException(403, { res: response });
}

export async function enforceBoardUserLimit(
  db: SelectDb,
  communityId: string,
  additions: number,
): Promise<Response | null> {
  const tier = await getCommunityTier(db, communityId);
  const maximum = getTierLimit(tier, "boardUsers");
  if (maximum === null) return null;

  const [members] = await db
    .select({ value: count() })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId));
  const [pending] = await db
    .select({ value: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.communityId, communityId),
        isNull(invitations.consumedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );

  if ((members?.value ?? 0) + (pending?.value ?? 0) + additions <= maximum) {
    return null;
  }

  return Response.json(
    { error: "limit_exceeded", limit: "board_users", maximum },
    { status: 403 },
  );
}

export async function assertBoardUserLimit(
  db: SelectDb,
  communityId: string,
  additions: number,
): Promise<void> {
  const response = await enforceBoardUserLimit(db, communityId, additions);
  if (response) throw new HTTPException(403, { res: response });
}

async function readCommunityId(c: HonoContext): Promise<string | null> {
  try {
    const body = await c.req.json();
    return typeof body?.communityId === "string" ? body.communityId : null;
  } catch {
    return null;
  }
}
