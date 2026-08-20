import { describe, it, expect } from "vitest";
import {
  FULL_TRIAL_TIER,
  getMinimumTierForFeature,
  getTierHomeRangeLabel,
  TIER,
  TRIAL_DURATION_DAYS,
  TRIAL_ENDING_REMINDER_DAYS,
  TIER_VALUES,
  priceIdToTier,
  recommendedTierFromUsage,
  tierCoversUsage,
  tierMeets,
  TIER_RANK,
  type CommunityUsage,
} from "../../src/billing/tiers.js";

describe("TIER_VALUES", () => {
  it("exports a readonly tuple of the four tier slugs", () => {
    expect(TIER_VALUES).toEqual(["starter", "growth", "scale", "portfolio"]);
  });

  it("contains exactly the same slugs as the TIER object", () => {
    const tierKeys = Object.values(TIER);
    expect([...TIER_VALUES].sort()).toEqual([...tierKeys].sort());
  });
});

describe("TIER constants", () => {
  it("exports the four expected tier values", () => {
    expect(TIER.starter).toBe("starter");
    expect(TIER.growth).toBe("growth");
    expect(TIER.scale).toBe("scale");
    expect(TIER.portfolio).toBe("portfolio");
  });
});

describe("TIER_RANK", () => {
  it("ranks starter < growth < scale < portfolio", () => {
    expect(TIER_RANK.starter).toBeLessThan(TIER_RANK.growth);
    expect(TIER_RANK.growth).toBeLessThan(TIER_RANK.scale);
    expect(TIER_RANK.scale).toBeLessThan(TIER_RANK.portfolio);
  });
});

describe("billing policy constants", () => {
  it("keeps trial policy in the shared billing source of truth", () => {
    expect(FULL_TRIAL_TIER).toBe(TIER.scale);
    expect(TRIAL_DURATION_DAYS).toBe(30);
    expect(TRIAL_ENDING_REMINDER_DAYS).toBe(3);
  });

  it("returns the minimum tier for each gated feature", () => {
    expect(getMinimumTierForFeature("owner-operations")).toBe(TIER.growth);
    expect(getMinimumTierForFeature("governance-workflows")).toBe(TIER.growth);
    expect(getMinimumTierForFeature("reports")).toBe(TIER.scale);
    expect(getMinimumTierForFeature("month-end-close")).toBe(TIER.scale);
    expect(getMinimumTierForFeature("audit-pack")).toBe(TIER.scale);
    expect(getMinimumTierForFeature("portfolio-rollups")).toBe(TIER.portfolio);
  });

  it("formats tier home ranges from shared tier limits", () => {
    expect(getTierHomeRangeLabel(TIER.starter)).toBe("up to 50 homes");
    expect(getTierHomeRangeLabel(TIER.growth)).toBe("51-200");
    expect(getTierHomeRangeLabel(TIER.scale)).toBe("201-500");
    expect(getTierHomeRangeLabel(TIER.portfolio)).toBe("501+ homes");
  });
});

describe("priceIdToTier", () => {
  it("maps price_starter to starter", () => {
    expect(priceIdToTier("price_starter")).toBe("starter");
  });

  it("maps price_growth to growth", () => {
    expect(priceIdToTier("price_growth")).toBe("growth");
  });

  it("maps price_scale to scale", () => {
    expect(priceIdToTier("price_scale")).toBe("scale");
  });

  it("maps price_portfolio to portfolio", () => {
    expect(priceIdToTier("price_portfolio")).toBe("portfolio");
  });

  it("maps env-style monthly and annual Stripe price ids back to the tier", () => {
    expect(priceIdToTier("price_growth_monthly")).toBe("growth");
    expect(priceIdToTier("price_growth_annual")).toBe("growth");
    expect(priceIdToTier("price_portfolio_annual")).toBe("portfolio");
  });

  it("returns null for an unknown price ID", () => {
    expect(priceIdToTier("price_unknown_xyz")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(priceIdToTier(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(priceIdToTier(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(priceIdToTier("")).toBeNull();
  });
});

describe("tierMeets", () => {
  it("returns true when current tier equals the minimum", () => {
    expect(tierMeets("starter", "starter")).toBe(true);
    expect(tierMeets("growth", "growth")).toBe(true);
    expect(tierMeets("scale", "scale")).toBe(true);
    expect(tierMeets("portfolio", "portfolio")).toBe(true);
  });

  it("returns true when current tier is above the minimum", () => {
    expect(tierMeets("growth", "starter")).toBe(true);
    expect(tierMeets("scale", "starter")).toBe(true);
    expect(tierMeets("scale", "growth")).toBe(true);
    expect(tierMeets("portfolio", "scale")).toBe(true);
    expect(tierMeets("portfolio", "growth")).toBe(true);
    expect(tierMeets("portfolio", "starter")).toBe(true);
  });

  it("returns false when current tier is below the minimum", () => {
    expect(tierMeets("starter", "growth")).toBe(false);
    expect(tierMeets("starter", "scale")).toBe(false);
    expect(tierMeets("growth", "scale")).toBe(false);
    expect(tierMeets("growth", "portfolio")).toBe(false);
    expect(tierMeets("scale", "portfolio")).toBe(false);
  });

  it("returns false when current tier is null", () => {
    expect(tierMeets(null, "starter")).toBe(false);
    expect(tierMeets(null, "scale")).toBe(false);
  });
});

const emptyUsage: CommunityUsage = {
  homes: 0,
  boardUsers: 0,
  pendingInvites: 0,
  featuresUsed: [],
};

describe("tierCoversUsage", () => {
  it("starter covers a small community with no feature usage", () => {
    expect(
      tierCoversUsage("starter", {
        ...emptyUsage,
        homes: 50,
        boardUsers: 3,
      }),
    ).toBe(true);
  });

  it("starter does not cover when homes exceed the cap", () => {
    expect(tierCoversUsage("starter", { ...emptyUsage, homes: 51 })).toBe(
      false,
    );
  });

  it("starter does not cover when seats + pending invites exceed the cap", () => {
    expect(
      tierCoversUsage("starter", {
        ...emptyUsage,
        boardUsers: 2,
        pendingInvites: 2,
      }),
    ).toBe(false);
  });

  it("starter does not cover Growth-only governance workflows", () => {
    expect(
      tierCoversUsage("starter", {
        ...emptyUsage,
        featuresUsed: ["governance-workflows"],
      }),
    ).toBe(false);
  });

  it("growth covers governance workflows but not reports", () => {
    expect(
      tierCoversUsage("growth", {
        ...emptyUsage,
        featuresUsed: ["governance-workflows"],
      }),
    ).toBe(true);
    expect(
      tierCoversUsage("growth", {
        ...emptyUsage,
        featuresUsed: ["reports"],
      }),
    ).toBe(false);
  });

  it("portfolio covers everything because all caps are unlimited", () => {
    expect(
      tierCoversUsage("portfolio", {
        homes: 100_000,
        boardUsers: 200,
        pendingInvites: 50,
        featuresUsed: [
          "owner-operations",
          "governance-workflows",
          "reports",
          "month-end-close",
          "audit-pack",
          "portfolio-rollups",
        ],
      }),
    ).toBe(true);
  });
});

describe("recommendedTierFromUsage", () => {
  it("returns starter for an empty community", () => {
    expect(recommendedTierFromUsage(emptyUsage)).toBe("starter");
  });

  it("returns growth when homes exceed the starter cap", () => {
    expect(recommendedTierFromUsage({ ...emptyUsage, homes: 80 })).toBe(
      "growth",
    );
  });

  it("returns scale when reports have been used", () => {
    expect(
      recommendedTierFromUsage({
        ...emptyUsage,
        featuresUsed: ["reports"],
      }),
    ).toBe("scale");
  });

  it("returns scale when month-end-close has been used", () => {
    expect(
      recommendedTierFromUsage({
        ...emptyUsage,
        featuresUsed: ["month-end-close"],
      }),
    ).toBe("scale");
  });

  it("returns scale when portfolio rollups require a custom plan", () => {
    expect(
      recommendedTierFromUsage({
        ...emptyUsage,
        featuresUsed: ["portfolio-rollups"],
      }),
    ).toBe("scale");
  });

  it("returns scale when home count exceeds the growth cap", () => {
    expect(recommendedTierFromUsage({ ...emptyUsage, homes: 250 })).toBe(
      "scale",
    );
  });

  it("returns scale when home count exceeds the scale cap", () => {
    expect(recommendedTierFromUsage({ ...emptyUsage, homes: 600 })).toBe(
      "scale",
    );
  });

  it("returns growth when seat usage requires it", () => {
    expect(
      recommendedTierFromUsage({
        ...emptyUsage,
        boardUsers: 4,
        pendingInvites: 0,
      }),
    ).toBe("growth");
  });

  it("escalates to the highest required tier when multiple constraints conflict", () => {
    expect(
      recommendedTierFromUsage({
        homes: 75,
        boardUsers: 5,
        pendingInvites: 2,
        featuresUsed: ["audit-pack"],
      }),
    ).toBe("scale");
  });
});
