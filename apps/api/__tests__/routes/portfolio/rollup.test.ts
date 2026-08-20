import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../src/types/env.js";

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

vi.mock("../../../src/lib/auth.js", () => ({
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

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockSelect,
  })),
}));

const mockRequirePortfolioOwner = vi.fn();

vi.mock("../../../src/domain/portfolio/membership.js", () => ({
  requirePortfolioOwner: mockRequirePortfolioOwner,
}));

const mockGetBatchCommunityRollup = vi.fn();

vi.mock("../../../src/domain/portfolio/rollup.js", () => ({
  getCommunityRollup: vi.fn(), // retained for direct domain tests; route uses batch
  getBatchCommunityRollup: mockGetBatchCommunityRollup,
}));

const { default: rollupRouter } =
  await import("../../../src/routes/portfolio/rollup.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", rollupRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env = mockEnv) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleRollup = {
  communityId: "comm-1",
  name: "Sunrise HOA",
  state: "CA",
  reservePctFunded: 25,
  fannieMaeCompliant: null,
  fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
  overdueAssessmentsCents: 0,
  lastCloseMonth: "2024-03",
};

describe("GET /portfolio/:id/rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio/portfolio-1/rollup", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not the portfolio owner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce({ status: 403 });

    const res = await makeRequest("/portfolio/portfolio-1/rollup", {
      method: "GET",
    });

    expect(res.status).toBe(403);
  });

  it("re-throws non-403 errors from requirePortfolioOwner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce(new Error("DB error"));

    const res = await makeRequest("/portfolio/portfolio-1/rollup", {
      method: "GET",
    });

    expect(res.status).toBe(500);
  });

  it("returns 200 with rollup data for all linked communities using single batch query", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    // Return linked community IDs
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue([
            { communityId: "comm-1" },
            { communityId: "comm-2" },
          ]),
      }),
    });

    const rollup1 = { ...sampleRollup, communityId: "comm-1" };
    const rollup2 = {
      ...sampleRollup,
      communityId: "comm-2",
      name: "Harbor Condos",
    };
    // getBatchCommunityRollup returns all rollups in one call
    mockGetBatchCommunityRollup.mockResolvedValueOnce([rollup1, rollup2]);

    const res = await makeRequest("/portfolio/portfolio-1/rollup", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      portfolioId: string;
      communities: Array<Record<string, unknown>>;
    };
    expect(body.portfolioId).toBe("portfolio-1");
    expect(Array.isArray(body.communities)).toBe(true);
    expect(body.communities).toHaveLength(2);
    expect(body.communities[0]).toMatchObject({
      communityId: "comm-1",
      communityName: "Sunrise HOA",
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
    });
    expect(body.communities[0]).not.toHaveProperty("name");
    expect(body.communities[1]).toMatchObject({
      communityId: "comm-2",
      communityName: "Harbor Condos",
    });
    // Exactly ONE batch call, not one-per-community
    expect(mockGetBatchCommunityRollup).toHaveBeenCalledOnce();
    expect(mockGetBatchCommunityRollup).toHaveBeenCalledWith(
      expect.anything(),
      ["comm-1", "comm-2"],
    );
  });

  it("returns 200 with empty communities array when portfolio has no linked communities", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    mockGetBatchCommunityRollup.mockResolvedValueOnce([]);

    const res = await makeRequest("/portfolio/portfolio-1/rollup", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      portfolioId: string;
      communities: unknown[];
    };
    expect(body.communities).toHaveLength(0);
    expect(mockGetBatchCommunityRollup).toHaveBeenCalledWith(
      expect.anything(),
      [],
    );
  });
});
