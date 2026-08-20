/** Single source of truth for the four tier slug values.
 * Consumed by the Zod schema (schemas/billing.ts) and the Drizzle pgEnum
 * (apps/api/src/db/schema/billing.ts) so all three stay in sync automatically.
 */
export const TIER_VALUES = ["starter", "growth", "scale", "portfolio"] as const;
export const SELF_SERVE_TIER_VALUES = ["starter", "growth", "scale"] as const;

export const TIER = {
  starter: "starter",
  growth: "growth",
  scale: "scale",
  portfolio: "portfolio",
} as const;
export type Tier = (typeof TIER)[keyof typeof TIER];

const PRICE_TO_TIER: Record<string, Tier> = {
  price_starter: TIER.starter,
  price_growth: TIER.growth,
  price_scale: TIER.scale,
  price_portfolio: TIER.portfolio,
};

export function priceIdToTier(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;
  const directMatch = PRICE_TO_TIER[priceId];
  if (directMatch) {
    return directMatch;
  }

  const match = priceId.match(
    /^price_(starter|growth|scale|portfolio)(?:_(monthly|annual))?$/,
  );
  if (!match) {
    return null;
  }

  return TIER[match[1] as keyof typeof TIER];
}

export const TIER_RANK: Record<Tier, number> = {
  [TIER.starter]: 0,
  [TIER.growth]: 1,
  [TIER.scale]: 2,
  [TIER.portfolio]: 3,
};

export const FULL_TRIAL_TIER = TIER.scale;
export const TRIAL_DURATION_DAYS = 30;
export const TRIAL_ENDING_REMINDER_DAYS = 3;

export function tierMeets(current: Tier | null, minimum: Tier): boolean {
  if (!current) return false;
  return TIER_RANK[current] >= TIER_RANK[minimum];
}

export type BoardRole =
  | "owner"
  | "admin"
  | "treasurer"
  | "secretary"
  | "viewer";

export type RoleCapability =
  | "community:update"
  | "member:invite"
  | "billing:manage"
  | "homeowner:read"
  | "homeowner:write"
  | "owner-portal-session:create"
  | "governance:write"
  | "finance:write"
  | "month-end-close:write"
  | "report:read"
  | "report:export";

export const ROLE_PERMISSIONS: Record<BoardRole, readonly RoleCapability[]> = {
  owner: [
    "community:update",
    "member:invite",
    "billing:manage",
    "homeowner:read",
    "homeowner:write",
    "owner-portal-session:create",
    "governance:write",
    "finance:write",
    "month-end-close:write",
    "report:read",
    "report:export",
  ],
  admin: [
    "community:update",
    "member:invite",
    "billing:manage",
    "homeowner:read",
    "homeowner:write",
    "owner-portal-session:create",
    "governance:write",
    "finance:write",
    "month-end-close:write",
    "report:read",
    "report:export",
  ],
  treasurer: [
    "homeowner:read",
    "homeowner:write",
    "owner-portal-session:create",
    "finance:write",
    "month-end-close:write",
    "report:read",
    "report:export",
  ],
  secretary: [
    "homeowner:read",
    "homeowner:write",
    "owner-portal-session:create",
    "governance:write",
  ],
  viewer: ["homeowner:read"],
} as const;

export function roleCan(
  role: BoardRole | null | undefined,
  capability: RoleCapability,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(capability) ?? false;
}

export type TierFeature =
  | "owner-operations"
  | "governance-workflows"
  | "reports"
  | "month-end-close"
  | "audit-pack"
  | "portfolio-rollups";

export const TIER_LIMITS: Record<
  Tier,
  { homes: number | null; boardUsers: number | null }
> = {
  starter: { homes: 50, boardUsers: 3 },
  growth: { homes: 200, boardUsers: 10 },
  scale: { homes: 500, boardUsers: null },
  portfolio: { homes: null, boardUsers: null },
};

export const FEATURE_MINIMUM_TIER: Record<TierFeature, Tier> = {
  "owner-operations": "growth",
  "governance-workflows": "growth",
  reports: "scale",
  "month-end-close": "scale",
  "audit-pack": "scale",
  "portfolio-rollups": "portfolio",
};

export function getMinimumTierForFeature(feature: TierFeature): Tier {
  return FEATURE_MINIMUM_TIER[feature];
}

export function getTierLimit(
  tier: Tier | null | undefined,
  limit: "homes" | "boardUsers",
): number | null {
  if (!tier) return TIER_LIMITS.starter[limit];
  return TIER_LIMITS[tier][limit];
}

export function getTierHomeRangeLabel(tier: Tier): string {
  const homes = TIER_LIMITS[tier].homes;
  if (tier === TIER.starter) {
    return `up to ${homes} homes`;
  }

  const currentIndex = TIER_VALUES.indexOf(tier);
  const previousTier = TIER_VALUES[currentIndex - 1] as Tier;
  const previousHomes = TIER_LIMITS[previousTier].homes as number;
  return homes === null
    ? `${previousHomes + 1}+ homes`
    : `${previousHomes + 1}-${homes}`;
}

export function tierAllowsFeature(
  tier: Tier | null | undefined,
  feature: TierFeature,
): boolean {
  return tierMeets(tier ?? null, FEATURE_MINIMUM_TIER[feature]);
}

export function isSelfServeTrialTier(tier: Tier): boolean {
  return SELF_SERVE_TIER_VALUES.includes(
    tier as (typeof SELF_SERVE_TIER_VALUES)[number],
  );
}

export type CommunityUsage = {
  homes: number;
  boardUsers: number;
  pendingInvites: number;
  featuresUsed: TierFeature[];
};

/**
 * Returns true when `tier` covers every cap and feature in `usage`.
 * A null cap in TIER_LIMITS means "unlimited" and always covers.
 */
export function tierCoversUsage(tier: Tier, usage: CommunityUsage): boolean {
  const homesCap = TIER_LIMITS[tier].homes;
  if (homesCap !== null && usage.homes > homesCap) return false;
  const seatCap = TIER_LIMITS[tier].boardUsers;
  if (seatCap !== null && usage.boardUsers + usage.pendingInvites > seatCap) {
    return false;
  }
  for (const feature of usage.featuresUsed) {
    if (!tierAllowsFeature(tier, feature)) return false;
  }
  return true;
}

/**
 * Smallest self-serve tier whose caps + feature gates cover the community's
 * current usage. Over-Scale or Portfolio-only usage returns Scale so product
 * surfaces never recommend Portfolio as a checkout action.
 */
export function recommendedTierFromUsage(usage: CommunityUsage): Tier {
  return (
    SELF_SERVE_TIER_VALUES.find((tier) => tierCoversUsage(tier, usage)) ??
    TIER.scale
  );
}
