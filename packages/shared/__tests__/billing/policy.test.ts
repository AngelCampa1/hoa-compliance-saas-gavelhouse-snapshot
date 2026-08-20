import { describe, expect, it } from "vitest";
import {
  FEATURE_MINIMUM_TIER,
  TIER_LIMITS,
  getTierLimit,
  isSelfServeTrialTier,
  roleCan,
  tierAllowsFeature,
} from "../../src/billing/tiers.js";

describe("role policy", () => {
  it("keeps viewer read-only and grants portal session creation only to homeowner writers", () => {
    expect(roleCan("viewer", "homeowner:read")).toBe(true);
    expect(roleCan("viewer", "homeowner:write")).toBe(false);
    expect(roleCan("viewer", "owner-portal-session:create")).toBe(false);

    expect(roleCan("owner", "owner-portal-session:create")).toBe(true);
    expect(roleCan("admin", "owner-portal-session:create")).toBe(true);
    expect(roleCan("treasurer", "owner-portal-session:create")).toBe(true);
    expect(roleCan("secretary", "owner-portal-session:create")).toBe(true);
    expect(roleCan(null, "homeowner:read")).toBe(false);
    expect(roleCan(undefined, "homeowner:read")).toBe(false);
  });

  it("centralizes invitation and billing permissions to owner and admin", () => {
    expect(roleCan("owner", "member:invite")).toBe(true);
    expect(roleCan("admin", "member:invite")).toBe(true);
    expect(roleCan("treasurer", "member:invite")).toBe(false);
    expect(roleCan("secretary", "billing:manage")).toBe(false);
  });

  it("limits report read and export access to finance roles", () => {
    for (const role of ["owner", "admin", "treasurer"] as const) {
      expect(roleCan(role, "report:read")).toBe(true);
      expect(roleCan(role, "report:export")).toBe(true);
    }

    for (const role of ["secretary", "viewer"] as const) {
      expect(roleCan(role, "report:read")).toBe(false);
      expect(roleCan(role, "report:export")).toBe(false);
    }
  });

  it("denies malformed persisted roles instead of throwing", () => {
    expect(roleCan("legacy-manager" as never, "homeowner:read")).toBe(false);
  });
});

describe("tier policy", () => {
  it("matches advertised home and board-user limits", () => {
    expect(TIER_LIMITS.starter).toEqual({ homes: 50, boardUsers: 3 });
    expect(TIER_LIMITS.growth).toEqual({ homes: 200, boardUsers: 10 });
    expect(TIER_LIMITS.scale).toEqual({ homes: 500, boardUsers: null });
    expect(TIER_LIMITS.portfolio).toEqual({
      homes: null,
      boardUsers: null,
    });
  });

  it("reads tier limits and defaults missing tier to Starter limits", () => {
    expect(getTierLimit(null, "homes")).toBe(50);
    expect(getTierLimit(undefined, "boardUsers")).toBe(3);
    expect(getTierLimit("growth", "homes")).toBe(200);
    expect(getTierLimit("portfolio", "boardUsers")).toBeNull();
  });

  it("gates Growth, Scale, and Portfolio feature families", () => {
    expect(FEATURE_MINIMUM_TIER["owner-operations"]).toBe("growth");
    expect(FEATURE_MINIMUM_TIER["month-end-close"]).toBe("scale");
    expect(FEATURE_MINIMUM_TIER["portfolio-rollups"]).toBe("portfolio");

    expect(tierAllowsFeature("starter", "owner-operations")).toBe(false);
    expect(tierAllowsFeature("growth", "owner-operations")).toBe(true);
    expect(tierAllowsFeature("growth", "month-end-close")).toBe(false);
    expect(tierAllowsFeature("scale", "audit-pack")).toBe(true);
    expect(tierAllowsFeature("scale", "portfolio-rollups")).toBe(false);
    expect(tierAllowsFeature(null, "owner-operations")).toBe(false);
    expect(tierAllowsFeature(undefined, "reports")).toBe(false);
  });

  it("allows only paid self-serve tiers as self-serve trial tiers", () => {
    expect(isSelfServeTrialTier("starter")).toBe(true);
    expect(isSelfServeTrialTier("growth")).toBe(true);
    expect(isSelfServeTrialTier("scale")).toBe(true);
    expect(isSelfServeTrialTier("portfolio")).toBe(false);
  });
});
