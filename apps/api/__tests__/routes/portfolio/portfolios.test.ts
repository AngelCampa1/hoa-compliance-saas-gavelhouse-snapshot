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

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

const mockRequirePortfolioOwner = vi.fn();

vi.mock("../../../src/domain/portfolio/membership.js", () => ({
  requirePortfolioOwner: mockRequirePortfolioOwner,
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const { default: portfoliosRouter } =
  await import("../../../src/routes/portfolio/portfolios.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", portfoliosRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env = mockEnv) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

/**
 * Set up the two DB select mocks needed for userHasPortfolioTier to return true.
 * Adds calls to mockSelect for (1) communityMembers and (2) subscriptions.
 */
function mockPortfolioTierPasses() {
  // First call: communityMembers query
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ communityId: "c-1" }]),
    }),
  });
  // Second call: subscriptions inArray query
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockResolvedValue([{ tier: "portfolio", status: "active" }]),
    }),
  });
}

/**
 * Set up the DB select mocks for userHasPortfolioTier to return false (no portfolio tier).
 */
function mockPortfolioTierFails() {
  // First call: communityMembers query — returns member
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ communityId: "c-1" }]),
    }),
  });
  // Second call: subscriptions query — returns starter tier
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ tier: "starter", status: "active" }]),
    }),
  });
}

describe("POST /portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Portfolio" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }), // empty name fails min(1)
    });

    expect(res.status).toBe(400);
  });

  it("returns 402 when user does not have portfolio tier", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierFails();

    const res = await makeRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Portfolio" }),
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; minimum: string };
    expect(body.error).toBe("upgrade_required");
    expect(body.minimum).toBe("portfolio");
  });

  it("creates a portfolio and returns 201 with portfolioId and name", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    mockPortfolioTierPasses();

    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "portfolio-1", name: "My Portfolio" }]),
      }),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Portfolio" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { portfolioId: string; name: string };
    expect(body.portfolioId).toBe("portfolio-1");
    expect(body.name).toBe("My Portfolio");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "portfolio_created",
      {
        portfolio_id: "portfolio-1",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("My Portfolio");
  });
});

describe("GET /portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio", { method: "GET" });

    expect(res.status).toBe(401);
  });

  it("returns 200 with list of portfolios for the user", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const fakePortfolios = [
      { id: "p-1", name: "Portfolio A", ownerUserId: "user-1" },
      { id: "p-2", name: "Portfolio B", ownerUserId: "user-1" },
    ];

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(fakePortfolios),
        }),
      }),
    });

    const res = await makeRequest("/portfolio", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfolios: unknown[] };
    expect(Array.isArray(body.portfolios)).toBe(true);
    expect(body.portfolios).toHaveLength(2);
  });

  it("returns empty array when user has no portfolios", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfolios: unknown[] };
    expect(body.portfolios).toHaveLength(0);
  });
});

describe("POST /portfolio — invalid body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when name is too long (max 120 chars)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(121) }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /portfolio/:id/communities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing communityId", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId: "portfolio-1" }), // missing communityId
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when body portfolioId disagrees with the path", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "other-portfolio",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "portfolioId must match path",
    });
    expect(mockRequirePortfolioOwner).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not the portfolio owner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce({ status: 403 });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not a member of the community", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    // No membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 402 (not 403) when community does not have portfolio tier — consistent with other upgrade_required responses", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    // Membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { userId: "user-1", communityId: "comm-1", role: "owner" },
            ]),
        }),
      }),
    });

    // Community found but on starter tier (not portfolio)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "comm-1", stripePriceId: "price_starter" },
            ]),
        }),
      }),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upgrade_required");
  });

  it("re-throws non-403 errors from requirePortfolioOwner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce(
      new Error("DB connection failed"),
    );

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    // The app's onError handler catches and returns 500
    expect(res.status).toBe(500);
  });

  it("returns 404 when community is not found after membership check", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    // Membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { userId: "user-1", communityId: "comm-1", role: "owner" },
            ]),
        }),
      }),
    });

    // Community not found
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 and links community when all checks pass", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    // Membership found
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { userId: "user-1", communityId: "comm-1", role: "owner" },
            ]),
        }),
      }),
    });

    // Community found with portfolio tier
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "comm-1", stripePriceId: "price_portfolio" },
            ]),
        }),
      }),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Insert on conflict do nothing
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      portfolioId: string;
      communityId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.portfolioId).toBe("portfolio-1");
    expect(body.communityId).toBe("comm-1");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "portfolio_community_linked",
      {
        community_id: "comm-1",
        membership_role: "owner",
        portfolio_id: "portfolio-1",
        tier: "portfolio",
      },
      "user-1",
      mockEnv,
    );
  });

  it("allows portfolio-tier trial even when legacy community price is not set", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { userId: "user-1", communityId: "comm-1", role: "owner" },
            ]),
        }),
      }),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: "comm-1", stripePriceId: null }]),
        }),
      }),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ tier: "portfolio", status: "trialing" }]),
        }),
      }),
    });

    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "portfolio-1",
        communityId: "comm-1",
      }),
    });

    expect(res.status).toBe(200);
  });
});

describe("DELETE /portfolio/:id/communities/:communityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio/portfolio-1/communities/comm-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not the portfolio owner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce({ status: 403 });

    const res = await makeRequest("/portfolio/portfolio-1/communities/comm-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(403);
  });

  it("re-throws non-403 errors from requirePortfolioOwner on DELETE", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockRejectedValueOnce(new Error("DB error"));

    const res = await makeRequest("/portfolio/portfolio-1/communities/comm-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(500);
  });

  it("returns 200 when community is successfully unlinked", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/portfolio/portfolio-1/communities/comm-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "portfolio_community_unlinked",
      {
        community_id: "comm-1",
        portfolio_id: "portfolio-1",
      },
      "user-1",
      mockEnv,
    );
  });
});

describe("PATCH /portfolio/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when name is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 402 when user does not have portfolio tier (PATCH)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierFails();

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; minimum: string };
    expect(body.error).toBe("upgrade_required");
    expect(body.minimum).toBe("portfolio");
  });

  it("returns 403 when user is not portfolio owner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockRejectedValueOnce({ status: 403 });

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when portfolio is not found", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 with renamed portfolio", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "portfolio-1", name: "New Name" }]),
        }),
      }),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      portfolio: { id: string; name: string };
    };
    expect(body.portfolio.name).toBe("New Name");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "portfolio_renamed",
      {
        portfolio_id: "portfolio-1",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("New Name");
  });

  it("re-throws non-403 errors from requirePortfolioOwner on PATCH", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockRejectedValueOnce(new Error("DB failure"));

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(500);
  });
});

describe("DELETE /portfolio/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
  });

  it("returns 402 when user does not have portfolio tier (DELETE)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierFails();

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; minimum: string };
    expect(body.error).toBe("upgrade_required");
    expect(body.minimum).toBe("portfolio");
  });

  it("returns 403 when user is not portfolio owner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockRejectedValueOnce({ status: 403 });

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(403);
  });

  it("returns 409 when portfolio has linked communities", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "link-1" }]),
        }),
      }),
    });

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("linked communities");
  });

  it("returns 200 and deletes the portfolio when no communities linked", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockResolvedValueOnce(undefined);

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "portfolio_deleted",
      {
        portfolio_id: "portfolio-1",
      },
      "user-1",
      mockEnv,
    );
  });

  it("re-throws non-403 errors from requirePortfolioOwner on DELETE portfolio", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockPortfolioTierPasses();
    mockRequirePortfolioOwner.mockRejectedValueOnce(new Error("Network error"));

    const res = await makeRequest("/portfolio/portfolio-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(500);
  });
});
