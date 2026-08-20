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

const mockGeneralLedger = vi.fn();
vi.mock("../../../src/domain/reporting/generalLedger.js", () => ({
  generalLedger: mockGeneralLedger,
}));

const { default: generalLedgerRouter } =
  await import("../../../src/routes/reports/generalLedger.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", generalLedgerRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleLedgerRows = [
  {
    entryId: "entry-1",
    entryDate: "2024-01-15",
    memo: "Operating deposit",
    accountId: "acc-1",
    accountCode: "1000",
    accountName: "Operating Checking",
    fundType: "operating",
    debitCents: 50000,
    creditCents: 0,
    runningBalanceCents: 50000,
  },
];

describe("GET /reports/general-ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31",
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
    const res = await makeRequest("/reports/general-ledger?from=2024-01-01&to=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid query parameters");
  });

  it("returns 403 when user is not a community member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 403 when community tier is below Scale", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_growth" }]),
        })),
      })),
    });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upgrade_required");
  });

  it("returns 400 when from or to params are missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    // Missing 'to' param
    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 200 with ledger rows and pagination metadata on happy path", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    mockGeneralLedger.mockResolvedValueOnce({ rows: sampleLedgerRows, total: 1 });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      rows: [
        {
          id: "entry-1",
          entryDate: "2024-01-15",
          memo: "Operating deposit",
          accountId: "acc-1",
          accountCode: "1000",
          accountName: "Operating Checking",
          fundType: "operating",
          debitCents: 50000,
          creditCents: 0,
          runningBalance: 50000,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    expect(mockGeneralLedger).toHaveBeenCalledWith(
      expect.anything(),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      undefined,
      undefined,
      50,
      0,
    );
  });

  it("passes custom limit and offset to generalLedger", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    mockGeneralLedger.mockResolvedValueOnce({ rows: [], total: 0 });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31&limit=10&offset=20",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockGeneralLedger).toHaveBeenCalledWith(
      expect.anything(),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      undefined,
      undefined,
      10,
      20,
    );
    const body = await res.json() as { limit: number; offset: number };
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
  });

  it("returns 400 when offset exceeds max (10000)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31&offset=10001",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when limit exceeds max (200)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31&limit=201",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 200 passing optional accountId and fundType filters", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ stripePriceId: "price_portfolio" }]),
        })),
      })),
    });

    // Account tenancy check — found in comm-1
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        })),
      })),
    });

    mockGeneralLedger.mockResolvedValueOnce({ rows: sampleLedgerRows, total: 1 });

    const res = await makeRequest("/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31&accountId=acc-1&fundType=operating",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockGeneralLedger).toHaveBeenCalledWith(
      expect.anything(),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      "acc-1",
      "operating",
      50,
      0,
    );
  });

  it("returns 404 when accountId belongs to a different community", async () => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    // Membership check passes (same as happy-path)
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

    // Tier check passes (same as happy-path)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    // Account tenancy check — not found (belongs to another community)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest(
      "/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31&accountId=acc-other-community",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Account not found");
    expect(mockGeneralLedger).not.toHaveBeenCalled();
  });

  it("skips accountId tenancy check when no accountId is provided", async () => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

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

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ stripePriceId: "price_scale" }]),
        })),
      })),
    });

    mockGeneralLedger.mockResolvedValueOnce({ rows: [], total: 0 });

    const res = await makeRequest(
      "/reports/general-ledger?communityId=comm-1&from=2024-01-01&to=2024-12-31",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockGeneralLedger).toHaveBeenCalledWith(
      expect.anything(),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      undefined,
      undefined,
      50,
      0,
    );
  });
});
