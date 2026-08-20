import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Tier, TierFeature } from "@boardstack/shared";
import type { Env } from "../../src/types/env.js";

type UsageResponse = {
  homes: number;
  boardUsers: number;
  pendingInvites: number;
  featuresUsed: TierFeature[];
  recommendedTier: Tier;
};

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
  STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
  RESEND_API_KEY: "resend_test",
  DATABASE_URL: "postgres://localhost/test",
};

const mockGetSession = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
}));

const mockSelect = vi.fn();

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockSelect,
  })),
}));

const usageModule = await import("../../src/routes/communitiesUsage.js");
const usageRouter = usageModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", usageRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, mockEnv);
}

/**
 * Stage a sequence of mock results for the chained `db.select().from().where()`
 * pattern used by the usage endpoint. Each entry is the array a `where()` call
 * should resolve to. Limit-suffixed selects (membership) get .limit(1) at the
 * end, so they need an extra link in the chain.
 */
function stageSelects(
  results: Array<{ kind: "where" | "limit"; rows: unknown[] }>,
) {
  for (const result of results) {
    if (result.kind === "limit") {
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(result.rows),
          })),
        })),
      });
    } else {
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(result.rows),
        })),
      });
    }
  }
}

describe("GET /communities/:id/usage", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSelect.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a member of the community", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([{ kind: "limit", rows: [] }]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    expect(res.status).toBe(403);
  });

  it("recommends starter for an empty community with no feature usage", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] }, // membership
      { kind: "where", rows: [{ value: 0 }] }, // homes
      { kind: "where", rows: [{ value: 1 }] }, // seats
      { kind: "where", rows: [{ value: 0 }] }, // pending invites
      // 7 feature probes — each empty
      { kind: "where", rows: [{ value: 0 }] }, // archRequests
      { kind: "where", rows: [{ value: 0 }] }, // violations
      { kind: "where", rows: [{ value: 0 }] }, // boardTransitions
      { kind: "where", rows: [{ value: 0 }] }, // ownerPortalSessions
      { kind: "where", rows: [{ value: 0 }] }, // monthEndCloses
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (audit_pack_export)
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (report_export)
      { kind: "where", rows: [{ value: 1 }] }, // owned communities count
      { kind: "where", rows: [{ value: 0 }] }, // owned portfolios count
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as UsageResponse;
    expect(body).toEqual({
      homes: 0,
      boardUsers: 1,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "starter",
    });
  });

  it("recommends growth when home count exceeds the starter cap", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 80 }] }, // homes
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    const body = (await res.json()) as UsageResponse;
    expect(body.homes).toBe(80);
    expect(body.recommendedTier).toBe("growth");
  });

  it("recommends scale when audit-pack feature has been used", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 10 }] }, // homes
      { kind: "where", rows: [{ value: 2 }] }, // seats
      { kind: "where", rows: [{ value: 0 }] },
      // governance-workflows probes — none
      { kind: "where", rows: [{ value: 0 }] }, // archRequests
      { kind: "where", rows: [{ value: 0 }] }, // violations
      { kind: "where", rows: [{ value: 0 }] }, // boardTransitions
      { kind: "where", rows: [{ value: 0 }] }, // ownerPortalSessions
      { kind: "where", rows: [{ value: 0 }] }, // monthEndCloses
      { kind: "where", rows: [{ value: 1 }] }, // auditEvents (audit_pack_export) — used!
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (report_export)
      { kind: "where", rows: [{ value: 1 }] }, // owned communities
      { kind: "where", rows: [{ value: 0 }] }, // owned portfolios
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    const body = (await res.json()) as UsageResponse;
    expect(body.featuresUsed).toContain("audit-pack");
    expect(body.recommendedTier).toBe("scale");
  });

  it("recommends Scale when the user owns multiple communities", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 3 }] }, // owned communities — 3 of them!
      { kind: "where", rows: [{ value: 0 }] },
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    const body = (await res.json()) as UsageResponse;
    expect(body.featuresUsed).toContain("portfolio-rollups");
    expect(body.recommendedTier).toBe("scale");
  });

  it("detects governance-workflows via violations (second probe)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] }, // archRequests
      { kind: "where", rows: [{ value: 1 }] }, // violations — used!
      // governance probe short-circuits, remaining feature probes below
      { kind: "where", rows: [{ value: 0 }] }, // ownerPortalSessions
      { kind: "where", rows: [{ value: 0 }] }, // monthEndCloses
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (audit_pack)
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (report)
      { kind: "where", rows: [{ value: 1 }] }, // owned communities
      { kind: "where", rows: [{ value: 0 }] }, // owned portfolios
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("governance-workflows");
    expect(body.recommendedTier).toBe("growth");
  });

  it("detects governance-workflows via boardTransitions (third probe)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] }, // archRequests
      { kind: "where", rows: [{ value: 0 }] }, // violations
      { kind: "where", rows: [{ value: 1 }] }, // boardTransitions — used!
      { kind: "where", rows: [{ value: 0 }] }, // ownerPortalSessions
      { kind: "where", rows: [{ value: 0 }] }, // monthEndCloses
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (audit_pack)
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (report)
      { kind: "where", rows: [{ value: 1 }] }, // owned communities
      { kind: "where", rows: [{ value: 0 }] }, // owned portfolios
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("governance-workflows");
  });

  it("detects owner-operations when portal sessions have been created", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] }, // archRequests
      { kind: "where", rows: [{ value: 0 }] }, // violations
      { kind: "where", rows: [{ value: 0 }] }, // boardTransitions
      { kind: "where", rows: [{ value: 1 }] }, // ownerPortalSessions — used!
      { kind: "where", rows: [{ value: 0 }] }, // monthEndCloses
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (audit_pack)
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (report)
      { kind: "where", rows: [{ value: 1 }] }, // owned communities
      { kind: "where", rows: [{ value: 0 }] }, // owned portfolios
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("owner-operations");
    expect(body.recommendedTier).toBe("growth");
  });

  it("detects month-end-close usage", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] }, // ownerPortalSessions
      { kind: "where", rows: [{ value: 1 }] }, // monthEndCloses — used!
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("month-end-close");
    expect(body.recommendedTier).toBe("scale");
  });

  it("detects reports usage via audit_events", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] }, // auditEvents (audit_pack)
      { kind: "where", rows: [{ value: 1 }] }, // auditEvents (report) — used!
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("reports");
  });

  it("detects portfolio-rollups via owned portfolios fallback", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [{ value: 5 }] },
      { kind: "where", rows: [{ value: 1 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 0 }] },
      { kind: "where", rows: [{ value: 1 }] }, // owned communities — only 1
      { kind: "where", rows: [{ value: 1 }] }, // owned portfolios — used!
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body.featuresUsed).toContain("portfolio-rollups");
    expect(body.recommendedTier).toBe("scale");
  });

  it("falls back to zero when count rows are missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    stageSelects([
      { kind: "limit", rows: [{ role: "owner" }] },
      { kind: "where", rows: [] }, // homes — no row
      { kind: "where", rows: [] }, // seats — no row
      { kind: "where", rows: [] }, // pending — no row
      { kind: "where", rows: [] }, // archRequests
      { kind: "where", rows: [] }, // violations
      { kind: "where", rows: [] }, // boardTransitions
      { kind: "where", rows: [] }, // ownerPortalSessions
      { kind: "where", rows: [] }, // monthEndCloses
      { kind: "where", rows: [] }, // auditEvents (audit_pack)
      { kind: "where", rows: [] }, // auditEvents (report)
      { kind: "where", rows: [] }, // owned communities
      { kind: "where", rows: [] }, // owned portfolios
    ]);

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });
    const body = (await res.json()) as UsageResponse;

    expect(body).toEqual({
      homes: 0,
      boardUsers: 0,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "starter",
    });
  });

  it("skips a probe gracefully when its query throws", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
    // 4 fixed selects, then a probe that throws, then the rest succeed
    mockSelect
      // membership
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ role: "owner" }]),
          })),
        })),
      })
      // homes / seats / pending
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ value: 10 }]),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        })),
      })
      // governance-workflows probe — throw on first inner query
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(new Error("missing column")),
        })),
      })
      // remaining probes return zero
      .mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        })),
      });

    const res = await makeRequest("/communities/c-1/usage", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as UsageResponse;
    // The failing probe should have been skipped; community is still small,
    // so the recommendation is starter.
    expect(body.featuresUsed).not.toContain("governance-workflows");
    expect(body.recommendedTier).toBe("starter");
  });
});
