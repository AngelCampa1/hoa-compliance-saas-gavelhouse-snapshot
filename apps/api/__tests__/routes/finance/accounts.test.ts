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
const mockCaptureEvent = vi.fn();

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

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

// Mock the seed function
const mockSeed = vi.fn();
vi.mock("../../../src/domain/accounting/seed.js", () => ({
  seedDefaultChartOfAccounts: mockSeed,
}));

const financeAccountsModule =
  await import("../../../src/routes/finance/accounts.js");
const financeAccountsRouter = financeAccountsModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", financeAccountsRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleAccounts = [
  {
    id: "acc-1",
    communityId: "comm-1",
    code: "1000",
    name: "Operating Checking",
    accountType: "asset",
    fundType: "operating",
    parentAccountId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "acc-2",
    communityId: "comm-1",
    code: "1500",
    name: "Reserve Checking",
    accountType: "asset",
    fundType: "reserve",
    parentAccountId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("finance/accounts routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSeed.mockResolvedValue({ created: true, count: 14 });
  });

  describe("GET /finance/accounts", () => {
    async function requestWithMember(query: string) {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "viewer" },
              ]),
          })),
        })),
      });

      return makeRequest(
        `/finance/accounts?communityId=comm-1&${query}`,
        { method: "GET" },
        mockEnv,
      );
    }

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/accounts?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: "user-1" },
      });

      const res = await makeRequest(
        "/finance/accounts",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 403 if user is not a member of the community", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership check returns empty
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("seeds missing defaults before returning accounts for write roles", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership check
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

      // accounts list query
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue(sampleAccounts),
            })),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { accounts: typeof sampleAccounts };
      expect(body).toHaveProperty("accounts");
      expect(Array.isArray(body.accounts)).toBe(true);
      expect(mockSeed).toHaveBeenCalledWith(expect.any(Object), "comm-1");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "chart_of_accounts_seeded",
        {
          community_id: "comm-1",
          role: "owner",
          seeded_count: 14,
        },
        "user-1",
        mockEnv,
      );
    });

    it("does not track chart seeding when defaults already exist", async () => {
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
      mockSeed.mockResolvedValueOnce({ created: false, count: 0 });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue(sampleAccounts),
            })),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "chart_of_accounts_seeded",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 200 with accounts array for treasurer role", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue(sampleAccounts),
            })),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { accounts: typeof sampleAccounts };
      expect(body.accounts).toHaveLength(2);
    });

    it.each([
      "limit=abc",
      "limit=0",
      "limit=-1",
      "limit=1.5",
      "limit=999",
      "offset=-1",
      "offset=abc",
      "offset=1.5",
    ])("returns 400 for invalid pagination query %s", async (query) => {
      const res = await requestWithMember(query);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /finance/accounts", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9000",
            name: "Test Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId missing from body", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: "9000",
            name: "Test Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when fundType is missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9000",
            name: "Test Account",
            accountType: "asset",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 403 if user is not a member", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9000",
            name: "Test Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 403 for viewer role on POST", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "viewer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9000",
            name: "Test Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 201 when account is created successfully", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: mockValues });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9000",
            name: "Special Reserve Fund",
            accountType: "asset",
            fundType: "reserve",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { accountId: string };
      expect(body).toHaveProperty("accountId");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "account_created",
        {
          account_id: "generated-id",
          account_type: "asset",
          community_id: "comm-1",
          fund_type: "reserve",
          role: "treasurer",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("Special Reserve Fund");
      expect(calls).not.toContain("9000");
    });

    it("still returns 201 when account creation analytics fails", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: mockValues });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "9100",
            name: "Analytics Failure Account",
            accountType: "expense",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual({ accountId: "generated-id" });
    });

    it("returns 409 when unique constraint violated (error code 23505)", async () => {
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

      // Simulate DB unique constraint error with code 23505
      const uniqueError = new Error(
        'duplicate key value violates unique constraint "accounts_community_id_code_unique"',
      );
      (uniqueError as Error & { code: string }).code = "23505";
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(uniqueError),
      });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "1000",
            name: "Duplicate Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 409 when error message contains duplicate key (no code)", async () => {
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

      // Error with "duplicate key" in message but no code
      const msgError = new Error("duplicate key constraint violation");
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(msgError),
      });

      const res = await makeRequest(
        "/finance/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "1000",
            name: "Duplicate Account",
            accountType: "asset",
            fundType: "operating",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /finance/accounts/:id", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            name: "Updated Name",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 403 when user is not a member of the community", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", name: "Updated Name" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 403 for viewer role", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "viewer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", name: "Updated Name" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 400 when trying to change fundType", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            fundType: "reserve",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 when trying to change accountType", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            accountType: "liability",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 when trying to change code", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            code: "1999",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "code cannot be changed after account creation",
      });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns 200 when updating name successfully", async () => {
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

      const mockSet = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        })),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            name: "Updated Account Name",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Account Name" }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "account_updated",
        {
          account_id: "acc-1",
          changed_active: false,
          changed_name: true,
          changed_parent_account: false,
          community_id: "comm-1",
          role: "owner",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("Updated Account Name");
    });

    it("still returns 200 when account update analytics fails", async () => {
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

      const mockSet = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        })),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            active: false,
            communityId: "comm-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    });

    it("returns 200 when updating active flag", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "admin" },
              ]),
          })),
        })),
      });

      const mockSet = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        })),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", active: false }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
      );
    });

    it("returns 400 for invalid JSON body", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "not-valid-json{{{",
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when name is empty string (validation failure)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            name: "",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 200 when updating parentAccountId", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-1", role: "treasurer" },
              ]),
          })),
        })),
      });

      const mockSet = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        })),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/finance/accounts/acc-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            parentAccountId: "parent-acc-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
    });

    it("returns 404 when accountId does not exist or belongs to another community", async () => {
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

      // Returning empty array simulates 0-row update (account not found or cross-community)
      const mockSet = vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/finance/accounts/acc-nonexistent",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", name: "Whatever" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Account not found");
    });
  });

  describe("POST /finance/accounts — non-unique DB error re-throws", () => {
    it("re-throws non-unique DB errors as 500", async () => {
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

      const dbError = new Error("Connection refused");
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(dbError),
      });

      const app = makeApp();
      // Add an error handler to catch re-thrown errors
      app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));

      const req = new Request("http://localhost/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          code: "9999",
          name: "Error Account",
          accountType: "asset",
          fundType: "operating",
        }),
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(500);
    });
  });
});
