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

const mockTrialBalance = vi.fn();
vi.mock("../../../src/domain/reporting/trialBalance.js", () => ({
  trialBalance: mockTrialBalance,
}));

const { default: trialBalanceRouter } =
  await import("../../../src/routes/reports/trialBalance.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", trialBalanceRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleRows = [
  {
    accountId: "acc-1",
    accountCode: "1000",
    accountName: "Operating Checking",
    accountType: "asset",
    fundType: "operating",
    debitCents: 50000,
    creditCents: 10000,
  },
];

describe("GET /reports/trial-balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/reports/trial-balance?communityId=comm-1&asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when communityId is missing (zValidator rejects)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // No communityId in query — zValidator runs first and rejects
    const res = await makeRequest("/reports/trial-balance?asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid query parameters");
  });

  it("returns 403 when user is not a community member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // membership check returns empty
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest("/reports/trial-balance?communityId=comm-1&asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 403 when community tier is below Scale", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // membership check succeeds
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // tier check — community has starter stripePriceId
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ stripePriceId: "price_starter" }]),
        })),
      })),
    });

    const res = await makeRequest("/reports/trial-balance?communityId=comm-1&asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; minimum: string };
    expect(body.error).toBe("upgrade_required");
  });

  it("returns 403 for secretary members before loading report rows", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "secretary" },
            ]),
        })),
      })),
    });

    const res = await makeRequest("/reports/trial-balance?communityId=comm-1&asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockTrialBalance).not.toHaveBeenCalled();
  });

  it("returns 400 when required query params are missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // membership check succeeds
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // tier check — scale community
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    // Missing asOf
    const res = await makeRequest("/reports/trial-balance?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 200 with trial balance rows on happy path", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // membership check succeeds
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { communityId: "comm-1", userId: "user-1", role: "owner" },
            ]),
        })),
      })),
    });

    // tier check — scale community
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    mockTrialBalance.mockResolvedValueOnce(sampleRows);

    const res = await makeRequest("/reports/trial-balance?communityId=comm-1&asOf=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ rows: sampleRows });
  });
});
