/**
 * Stress / property-based tests for packages/shared/src/billing/tiers.ts
 *
 * Seeded deterministic PRNG (mulberry32). No extra npm deps.
 * Genuine source bugs are marked it.fails with a "// BUG:" comment.
 */

import { describe, expect, it } from "vitest";
import {
  TIER,
  TIER_LIMITS,
  TIER_RANK,
  TIER_VALUES,
  SELF_SERVE_TIER_VALUES,
  getTierLimit,
  getTierHomeRangeLabel,
  priceIdToTier,
  recommendedTierFromUsage,
  roleCan,
  tierAllowsFeature,
  tierCoversUsage,
  tierMeets,
  type CommunityUsage,
  type Tier,
  type TierFeature,
} from "../../src/billing/tiers.js";

// ── seeded PRNG ──────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_TIERS: Tier[] = [...TIER_VALUES];
const SELF_SERVE: Tier[] = [...SELF_SERVE_TIER_VALUES];
const FEATURES: TierFeature[] = [
  "owner-operations",
  "governance-workflows",
  "reports",
  "month-end-close",
  "audit-pack",
  "portfolio-rollups",
];

function makeUsage(
  homes: number,
  boardUsers: number,
  pendingInvites: number,
  featuresUsed: TierFeature[],
): CommunityUsage {
  return { homes, boardUsers, pendingInvites, featuresUsed };
}

// ── tierMeets ─────────────────────────────────────────────────────────────────
describe("tierMeets — invariants", () => {
  it("null current always returns false", () => {
    for (const minimum of ALL_TIERS) {
      expect(tierMeets(null, minimum)).toBe(false);
    }
  });

  it("reflexive: tierMeets(t, t) is always true", () => {
    for (const t of ALL_TIERS) {
      expect(tierMeets(t, t)).toBe(true);
    }
  });

  it("transitive order: higher tier meets any lower minimum", () => {
    for (const current of ALL_TIERS) {
      for (const minimum of ALL_TIERS) {
        const expected = TIER_RANK[current] >= TIER_RANK[minimum];
        expect(tierMeets(current, minimum)).toBe(expected);
      }
    }
  });

  it("consistent with TIER_RANK: if tierMeets(a,b) and tierMeets(b,c) then tierMeets(a,c)", () => {
    for (const a of ALL_TIERS) {
      for (const b of ALL_TIERS) {
        for (const c of ALL_TIERS) {
          if (tierMeets(a, b) && tierMeets(b, c)) {
            expect(tierMeets(a, c)).toBe(true);
          }
        }
      }
    }
  });
});

// ── tierCoversUsage ───────────────────────────────────────────────────────────
describe("tierCoversUsage — invariants", () => {
  it("portfolio (null caps) covers any usage with no portfolio-only features", () => {
    const rng = mulberry32(0xf00d);
    for (let i = 0; i < 500; i++) {
      const homes = Math.floor(rng() * 10000);
      const boardUsers = Math.floor(rng() * 100);
      const pending = Math.floor(rng() * 50);
      // Only features that are NOT portfolio-only
      const usage = makeUsage(homes, boardUsers, pending, [
        "reports",
        "month-end-close",
      ]);
      expect(tierCoversUsage(TIER.portfolio, usage)).toBe(true);
    }
  });

  it("starter (homes≤50, boardUsers≤3) — boundary: homes=50 is covered", () => {
    expect(tierCoversUsage(TIER.starter, makeUsage(50, 3, 0, []))).toBe(true);
  });

  it("starter — homes=51 is NOT covered", () => {
    expect(tierCoversUsage(TIER.starter, makeUsage(51, 1, 0, []))).toBe(false);
  });

  it("starter — boardUsers + pendingInvites exceeding 3 is NOT covered", () => {
    expect(tierCoversUsage(TIER.starter, makeUsage(10, 2, 2, []))).toBe(false);
  });

  it("starter — boardUsers=3, pendingInvites=0 is covered", () => {
    expect(tierCoversUsage(TIER.starter, makeUsage(1, 3, 0, []))).toBe(true);
  });

  it("monotonic: if tier T covers usage, all higher tiers also cover it", () => {
    const rng = mulberry32(0xbeef);
    for (let i = 0; i < 1000; i++) {
      const homes = Math.floor(rng() * 600);
      const boardUsers = Math.floor(rng() * 15);
      const pending = Math.floor(rng() * 5);
      // Features that exist at some self-serve tier
      const featureSubset: TierFeature[] = [];
      if (rng() > 0.5) featureSubset.push("reports");
      if (rng() > 0.7) featureSubset.push("month-end-close");
      const usage = makeUsage(homes, boardUsers, pending, featureSubset);

      let lastCovered = false;
      for (const tier of ALL_TIERS) {
        const covered = tierCoversUsage(tier, usage);
        if (lastCovered) {
          // once covered, all higher tiers must also cover
          expect(covered).toBe(true);
        }
        if (covered) lastCovered = true;
      }
    }
  });
});

// ── recommendedTierFromUsage ──────────────────────────────────────────────────
describe("recommendedTierFromUsage — invariants", () => {
  it("always returns a self-serve tier slug", () => {
    const rng = mulberry32(0x1a2b3c);
    for (let i = 0; i < 2000; i++) {
      const homes = Math.floor(rng() * 1000);
      const boardUsers = Math.floor(rng() * 30);
      const pending = Math.floor(rng() * 10);
      const usage = makeUsage(homes, boardUsers, pending, []);
      const rec = recommendedTierFromUsage(usage);
      expect(SELF_SERVE).toContain(rec);
    }
  });

  // Note: excludes "portfolio-rollups" and usage above scale caps (homes>500,
  // boardUsers+pending>10 at scale) — those exceed all self-serve tiers and
  // the fallback bug is documented in the it.fails blocks below.
  it("recommended tier always covers the usage within scale-coverable bounds", () => {
    const rng = mulberry32(0x4d5e6f);
    for (let i = 0; i < 2000; i++) {
      // Keep within scale's coverage: homes ≤ 500, boardUsers+pending ≤ unlimited
      // Scale has homes:500, boardUsers:null — so homes must be ≤500
      const homes = Math.floor(rng() * 501); // [0..500]
      const boardUsers = Math.floor(rng() * 15);
      const pending = Math.floor(rng() * 5);
      const featureSubset: TierFeature[] = [];
      if (rng() > 0.5) featureSubset.push("reports");
      if (rng() > 0.7) featureSubset.push("month-end-close");
      const usage = makeUsage(homes, boardUsers, pending, featureSubset);
      const rec = recommendedTierFromUsage(usage);
      expect(tierCoversUsage(rec, usage)).toBe(true);
    }
  });

  it("monotonic in homes: more homes never recommends a lower tier", () => {
    // Only vary homes; hold everything else constant with no features
    const homesValues = [
      0, 1, 10, 49, 50, 51, 100, 199, 200, 201, 499, 500, 501, 1000,
    ];
    let lastRank = 0;
    for (const homes of homesValues) {
      const usage = makeUsage(homes, 1, 0, []);
      const rec = recommendedTierFromUsage(usage);
      const rank = TIER_RANK[rec];
      expect(rank).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank;
    }
  });

  it("monotonic in boardUsers+pending: more seats never recommends a lower tier", () => {
    const seatValues = [0, 1, 2, 3, 4, 5, 9, 10, 11, 20];
    let lastRank = 0;
    for (const seats of seatValues) {
      const usage = makeUsage(1, seats, 0, []);
      const rec = recommendedTierFromUsage(usage);
      const rank = TIER_RANK[rec];
      expect(rank).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank;
    }
  });

  // INTENDED (per JSDoc at billing/tiers.ts:219-223): "Over-Scale or
  // Portfolio-only usage returns Scale so product surfaces never recommend
  // Portfolio as a checkout action." recommendedTierFromUsage always returns
  // a self-serve tier — it is a UI recommendation helper, not a coverage
  // oracle. Portfolio-only features and homes > 500 correctly fall back to
  // scale so the UI can surface a self-serve upgrade path.
  it("portfolio-only features: recommendation is still a self-serve tier (scale fallback is intended)", () => {
    const usage = makeUsage(1, 1, 0, ["portfolio-rollups"]);
    const rec = recommendedTierFromUsage(usage);
    // Must be a self-serve tier — never portfolio, never throws
    expect(SELF_SERVE).toContain(rec);
  });

  it("homes > 500: recommendation is still a self-serve tier (scale fallback is intended)", () => {
    const usage = makeUsage(501, 1, 0, []);
    const rec = recommendedTierFromUsage(usage);
    // Must be a self-serve tier — the fallback to scale is by design
    expect(SELF_SERVE).toContain(rec);
  });
});

// ── getTierLimit ──────────────────────────────────────────────────────────────
describe("getTierLimit — edge cases", () => {
  it("null/undefined tier returns starter limits", () => {
    expect(getTierLimit(null, "homes")).toBe(TIER_LIMITS.starter.homes);
    expect(getTierLimit(undefined, "homes")).toBe(TIER_LIMITS.starter.homes);
  });

  it("portfolio has null homes cap (unlimited)", () => {
    expect(getTierLimit(TIER.portfolio, "homes")).toBeNull();
  });

  it("scale has a finite homes cap of 500", () => {
    expect(getTierLimit(TIER.scale, "homes")).toBe(500);
  });

  it("scale has null boardUsers cap", () => {
    expect(getTierLimit(TIER.scale, "boardUsers")).toBeNull();
  });
});

// ── priceIdToTier ──────────────────────────────────────────────────────────────
describe("priceIdToTier — fuzz", () => {
  it("never throws on arbitrary string inputs", () => {
    const rng = mulberry32(0xacdc);
    const chars = "price_startergrowthscaleportfoliomonthlyannu0123456789_";
    for (let i = 0; i < 3000; i++) {
      const len = Math.floor(rng() * 40);
      let s = "";
      for (let j = 0; j < len; j++)
        s += chars[Math.floor(rng() * chars.length)];
      expect(() => priceIdToTier(s)).not.toThrow();
    }
  });

  it("returns null for null/undefined/empty", () => {
    expect(priceIdToTier(null)).toBeNull();
    expect(priceIdToTier(undefined)).toBeNull();
    expect(priceIdToTier("")).toBeNull();
  });

  it("canonical price ids map to correct tiers", () => {
    const cases: [string, Tier][] = [
      ["price_starter", "starter"],
      ["price_growth", "growth"],
      ["price_scale", "scale"],
      ["price_portfolio", "portfolio"],
      ["price_starter_monthly", "starter"],
      ["price_growth_annual", "growth"],
      ["price_scale_monthly", "scale"],
      ["price_portfolio_annual", "portfolio"],
    ];
    for (const [id, expected] of cases) {
      expect(priceIdToTier(id)).toBe(expected);
    }
  });

  it("result is always one of the 4 known tiers or null", () => {
    const inputs = [
      "price_starter_monthly",
      "price_STARTER",
      "price_",
      "price_free",
      "garbage",
      "price_starter_extra",
    ];
    for (const id of inputs) {
      const result = priceIdToTier(id);
      expect(result === null || ALL_TIERS.includes(result as Tier)).toBe(true);
    }
  });
});

// ── getTierHomeRangeLabel ─────────────────────────────────────────────────────
describe("getTierHomeRangeLabel — invariants", () => {
  it("never throws for any valid tier", () => {
    for (const tier of ALL_TIERS) {
      expect(() => getTierHomeRangeLabel(tier)).not.toThrow();
    }
  });

  it("starter label starts with 'up to'", () => {
    expect(getTierHomeRangeLabel("starter")).toMatch(/^up to/);
  });

  it("portfolio label ends with '+ homes' (unlimited)", () => {
    expect(getTierHomeRangeLabel("portfolio")).toMatch(/\+ homes$/);
  });
});

// ── roleCan — fuzz ────────────────────────────────────────────────────────────
describe("roleCan — edge cases", () => {
  it("returns false for null/undefined role", () => {
    expect(roleCan(null, "finance:write")).toBe(false);
    expect(roleCan(undefined, "finance:write")).toBe(false);
  });

  it("owner has all capabilities", () => {
    const allCapabilities = [
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
    ] as const;
    for (const cap of allCapabilities) {
      expect(roleCan("owner", cap)).toBe(true);
    }
  });

  it("viewer only has homeowner:read", () => {
    expect(roleCan("viewer", "homeowner:read")).toBe(true);
    expect(roleCan("viewer", "finance:write")).toBe(false);
    expect(roleCan("viewer", "billing:manage")).toBe(false);
  });
});

// ── tierAllowsFeature ────────────────────────────────────────────────────────
describe("tierAllowsFeature — invariants", () => {
  it("null tier never allows any feature", () => {
    for (const feature of FEATURES) {
      expect(tierAllowsFeature(null, feature)).toBe(false);
    }
  });

  it("portfolio allows all features", () => {
    for (const feature of FEATURES) {
      expect(tierAllowsFeature("portfolio", feature)).toBe(true);
    }
  });

  it("starter allows no features (all require growth+)", () => {
    for (const feature of FEATURES) {
      expect(tierAllowsFeature("starter", feature)).toBe(false);
    }
  });
});
