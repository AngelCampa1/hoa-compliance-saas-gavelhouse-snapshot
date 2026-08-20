import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";
import {
  boardTransitions,
  communityMembers,
} from "../../src/db/schema/index.js";

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

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockCaptureEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}));

vi.mock("../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const mockCheckRateLimit = vi
  .fn()
  .mockResolvedValue({ allowed: true, remaining: 49 });
vi.mock("../../src/lib/rateLimiter.js", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const communitiesModule = await import("../../src/routes/communities.js");
const communitiesRouter = communitiesModule.default;

function mockActiveTier(tier: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ tier, status: "active" }]),
      })),
    })),
  });
}

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
    then(
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(rows).then(onFulfilled, onRejected);
    },
    catch(onRejected: (reason: unknown) => unknown) {
      return Promise.resolve(rows).catch(onRejected);
    },
    finally(onFinally: () => void) {
      return Promise.resolve(rows).finally(onFinally);
    },
  };
  return chain;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", communitiesRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

describe("communities routes", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockTransaction.mockReset();
    mockCaptureEvent.mockClear();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 49 });
  });

  describe("auth middleware", () => {
    it("returns 401 when not authenticated on /communities/me", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/communities/me",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("does NOT return 401 for /api/auth/* paths (middleware scoped to community routes only)", async () => {
      // The auth middleware must NOT intercept auth-library paths.
      // Before the fix, communitiesRouter.use("/*") would fire for any path
      // and return 401 when no session exists, blocking Better Auth sign-up.
      const res = await makeRequest(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test",
            email: "t@t.com",
            password: "Test1234!",
          }),
        },
        mockEnv,
      );
      // Should be 404 (no handler) or pass through — NOT 401 from our middleware.
      expect(res.status).not.toBe(401);
    });

    it("does NOT intercept /health (middleware scoped to community routes only)", async () => {
      const res = await makeRequest("/health", { method: "GET" }, mockEnv);
      expect(res.status).not.toBe(401);
    });
  });

  describe("GET /communities/me", () => {
    it("returns communities for authenticated user", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      const mockMemberships = [
        {
          community: {
            id: "c1",
            name: "HOA One",
            slug: "hoa-one",
            state: "CA",
          },
          role: "owner",
        },
      ];
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(mockMemberships),
          })),
        })),
      });

      const res = await makeRequest(
        "/communities/me",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ communities: mockMemberships });
    });
  });

  describe("POST /communities", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await makeRequest(
        "/communities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", slug: "test", state: "CA" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 201 with communityId on success", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            insert: vi.fn(() => ({
              values: mockValues,
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/communities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty("communityId");
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "pending_trial",
          tier: "starter",
        }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "community_created",
        expect.objectContaining({
          community_id: "generated-id",
          role: "owner",
          tier: "starter",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("seeds the default chart of accounts in the creation transaction", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      const insertedRows: Array<Record<string, unknown>> = [];
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            insert: vi.fn(() => ({
              values: vi.fn((row: Record<string, unknown>) => {
                insertedRows.push(row);
                return Promise.resolve(undefined);
              }),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/communities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(
        insertedRows.filter((row) => row["communityId"] === "generated-id"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "1000",
            name: "Operating Checking",
            fundType: "operating",
          }),
          expect.objectContaining({
            code: "4000",
            accountType: "revenue",
            fundType: "operating",
          }),
          expect.objectContaining({
            code: "1500",
            name: "Reserve Checking",
            fundType: "reserve",
          }),
          expect.objectContaining({
            code: "4100",
            accountType: "revenue",
            fundType: "reserve",
          }),
        ]),
      );
      expect(
        insertedRows.filter((row) => typeof row["code"] === "string"),
      ).toHaveLength(14);
    });

    it("returns 400 for invalid body (missing state)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });

      const res = await makeRequest(
        "/communities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "No State HOA", slug: "no-state" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid slug format", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });

      const res = await makeRequest(
        "/communities",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "HOA",
            slug: "INVALID SLUG!",
            state: "TX",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /communities/:id/invitations", () => {
    it("returns 201 with token on success", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      // Mock membership check returning owner membership
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
      // Tier lookup for assertBoardUserLimit inside the transaction
      mockActiveTier("portfolio");
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: mockValues });
      mockTransaction.mockImplementationOnce(
        async (callback: (tx: unknown) => unknown) =>
          callback({
            insert: mockInsert,
            select: mockSelect,
            update: mockUpdate,
            execute: vi.fn(async () => undefined),
          }),
      );

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty("token");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "member_invited",
        {
          community_id: "comm-1",
          role: "treasurer",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("invite@example.com");
      expect(calls).not.toContain("generated-id");
    });

    it("still returns 201 when invitation analytics fails", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
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
      mockActiveTier("portfolio");
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      });
      mockTransaction.mockImplementationOnce(
        async (callback: (tx: unknown) => unknown) =>
          callback({
            insert: mockInsert,
            select: mockSelect,
            update: mockUpdate,
            execute: vi.fn(async () => undefined),
          }),
      );
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toHaveProperty("token");
    });

    it("returns 403 when caller is not a member of the community", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-2", email: "other@example.com" },
      });
      // Mock membership check returning no membership
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 403 when caller is a member but not owner or admin", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-3", email: "member@example.com" },
      });
      // Mock membership check returning non-admin role
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { communityId: "comm-1", userId: "user-3", role: "treasurer" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "secretary",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 400 for invalid invitation (owner role not allowed)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invite@example.com", role: "owner" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 429 when community invitation rate limit is exceeded", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      // Membership check passes (owner role)
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
      // Rate limiter rejects
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
      });

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("limit");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "member_invite_failed",
        {
          community_id: "comm-1",
          failure_reason: "rate_limited",
          role: "treasurer",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("invite@example.com");
    });

    it("acquires seat lock BEFORE assertBoardUserLimit select inside transaction (POST /communities/:id/invitations)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      // Membership check returning owner membership
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
      // Tier lookup for assertBoardUserLimit inside the transaction
      mockActiveTier("portfolio");
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValueOnce({ values: mockValues });

      const callLog: string[] = [];

      mockTransaction.mockImplementationOnce(
        async (callback: (tx: unknown) => unknown) => {
          const txSelect = vi.fn((...args: unknown[]) => {
            callLog.push("select");
            return (mockSelect as unknown as (...a: unknown[]) => unknown)(
              ...args,
            );
          });
          return callback({
            insert: mockInsert,
            select: txSelect,
            update: mockUpdate,
            execute: vi.fn(async (query: unknown) => {
              callLog.push("execute");
              const json = JSON.stringify(query);
              expect(json).toContain("pg_advisory_xact_lock");
              expect(json).toContain("seat:");
              return undefined;
            }),
          });
        },
      );

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );
      expect(res.status).toBe(201);
      expect(callLog.indexOf("execute")).toBeLessThan(callLog.indexOf("select"));
    });

    it("still returns 429 when invite failure analytics fails", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
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
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
      });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/communities/comm-1/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            role: "treasurer",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("limit");
    });
  });

  describe("PATCH /communities/setup", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test HOA", state: "TX" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 and updates community name and state", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      // First select: find the owned community
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  community: {
                    id: "comm-1",
                    name: "Old Name Community",
                    slug: "old-name",
                    state: null,
                    ownerUserId: "user-owner",
                  },
                  role: "owner",
                },
              ]),
            })),
          })),
        })),
      });
      const mockSet = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Sunset HOA", state: "TX" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Sunset HOA", state: "TX" }),
      );
    });

    it("updates the explicitly selected owned community when communityId is provided", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      const mockLimit = vi.fn().mockResolvedValue([
        {
          community: {
            id: "comm-2",
            name: "Second Community",
            slug: "second-community",
            state: "CA",
            ownerUserId: "user-owner",
          },
          role: "owner",
        },
      ]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: mockWhere,
          })),
        })),
      });
      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({
        where: mockUpdateWhere,
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-2",
            name: "Updated Community",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockWhere).toHaveBeenCalled();
      expect(mockUpdateWhere).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Community" }),
      );
    });

    it("allows admins with community:update permission to update setup", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-admin", email: "admin@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  community: {
                    id: "comm-1",
                    name: "Old Name Community",
                    slug: "old-name",
                    state: null,
                    ownerUserId: "user-owner",
                  },
                  role: "admin",
                },
              ]),
            })),
          })),
        })),
      });
      const mockSet = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", name: "Sunset HOA" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Sunset HOA" }),
      );
    });

    it("returns 403 when membership cannot update community setup", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-viewer", email: "viewer@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  community: {
                    id: "comm-1",
                    name: "Old Name Community",
                    slug: "old-name",
                    state: null,
                    ownerUserId: "user-owner",
                  },
                  role: "viewer",
                },
              ]),
            })),
          })),
        })),
      });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", name: "Sunset HOA" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns 200 with partial update when only name is provided", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  community: {
                    id: "comm-1",
                    name: "Old",
                    slug: "old",
                    state: null,
                    ownerUserId: "user-owner",
                  },
                  role: "owner",
                },
              ]),
            })),
          })),
        })),
      });
      const mockSet = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.not.objectContaining({ state: expect.anything() }),
      );
    });

    it("returns 200 with partial update when only state is provided", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  community: {
                    id: "comm-1",
                    name: "Old",
                    slug: "old",
                    state: null,
                    ownerUserId: "user-owner",
                  },
                  role: "owner",
                },
              ]),
            })),
          })),
        })),
      });
      const mockSet = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      mockUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "TX" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ state: "TX" }),
      );
    });

    it("returns 404 when user has no owned community", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-no-community", email: "nobody@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", state: "TX" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "Community not found" });
    });

    it("returns 400 for invalid state code", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "texas" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid name (empty string)", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });

      const res = await makeRequest(
        "/communities/setup",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /invitations/:token/accept", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await makeRequest(
        "/invitations/some-token/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when invitation not found", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/invitations/nonexistent-token/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "Invitation not found" });
    });

    it("returns 410 when invitation is already consumed", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "tok",
                communityId: "c1",
                role: "treasurer",
                consumedAt: new Date(),
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/invitations/tok/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body).toEqual({ error: "Invitation expired or already used" });
    });

    it("returns 410 when invitation is expired", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "test@example.com" },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "tok",
                communityId: "c1",
                role: "treasurer",
                consumedAt: null,
                expiresAt: new Date(Date.now() - 86400000), // expired
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/invitations/tok/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(410);
    });

    it("returns 403 when email is not verified", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: false,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "Email address must be verified before accepting an invitation",
      });
    });

    it("returns 403 when the invitation email does not match the signed-in user", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "other@example.com", emailVerified: true },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "This invitation is for a different email address",
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "invitation_accept_failed",
        {
          community_id: "c1",
          failure_reason: "email_mismatch",
          role: "secretary",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("valid-tok");
      expect(calls).not.toContain("invitee@example.com");
      expect(calls).not.toContain("other@example.com");
    });

    it("still returns 403 when invitation mismatch analytics fails", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-1", email: "other@example.com", emailVerified: true },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "This invitation is for a different email address",
      });
    });

    it("returns 409 and leaves the invitation untouched when the user is already a member", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi.fn(() => makeSelectChain([{ tier: "starter" }])),
            insert: vi.fn(() => ({
              values: insertValues,
            })),
            update: vi.fn(() => ({ set: updateSet })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "You are already a member of this community",
      });
      expect(insertValues).toHaveBeenCalled();
      expect(insertOnConflictDoNothing).toHaveBeenCalled();
      expect(insertReturning).toHaveBeenCalled();
      expect(updateWhere).not.toHaveBeenCalled();
    });

    it("returns 500 when invitation acceptance fails unexpectedly", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      const insertReturning = vi
        .fn()
        .mockRejectedValue(new Error("database unavailable"));
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi.fn(() => makeSelectChain([{ tier: "starter" }])),
            insert: vi.fn(() => ({
              values: insertValues,
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const app = new Hono<{ Bindings: Env }>();
      app.route("/", communitiesRouter);
      app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));

      const res = await app.fetch(
        new Request("http://localhost/invitations/valid-tok/accept", {
          method: "POST",
        }),
        mockEnv,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "Internal server error",
      });
      expect(insertValues).toHaveBeenCalled();
      expect(insertOnConflictDoNothing).toHaveBeenCalled();
      expect(insertReturning).toHaveBeenCalled();
    });

    it("acquires seat lock BEFORE assertBoardUserLimit select inside transaction (POST /invitations/:token/accept)", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));

      const callLog: string[] = [];

      mockTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<void>) => {
          const txSelect = vi.fn(() => {
            callLog.push("select");
            return makeSelectChain([{ tier: "starter", status: "active" }]);
          });
          const mockTx = {
            select: txSelect,
            insert: vi.fn(() => ({ values: insertValues })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async (query: unknown) => {
              callLog.push("execute");
              const json = JSON.stringify(query);
              expect(json).toContain("pg_advisory_xact_lock");
              expect(json).toContain("seat:");
              return undefined;
            }),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(callLog.indexOf("execute")).toBeLessThan(callLog.indexOf("select"));
    });

    it("returns 200 when invitation is valid and accepted", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi.fn(() =>
              makeSelectChain([{ tier: "starter", status: "active" }]),
            ),
            insert: vi.fn(() => ({
              values: insertValues,
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "invitation_accept_completed",
        {
          community_id: "c1",
          role: "secretary",
          transition_created: false,
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("valid-tok");
      expect(calls).not.toContain("invitee@example.com");
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedAt: expect.any(Date),
          userId: "user-1",
        }),
      );
      expect(insertOnConflictDoNothing).toHaveBeenCalled();
      expect(insertReturning).toHaveBeenCalled();
    });

    it("still returns 200 when invitation acceptance analytics fails", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi.fn(() =>
              makeSelectChain([{ tier: "starter", status: "active" }]),
            ),
            insert: vi.fn(() => ({
              values: insertValues,
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    });

    it("creates a pending board transition when a transition role invitation is accepted", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "incoming-secretary",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertedRows: Array<Record<string, unknown>> = [];
      const insertedTables: unknown[] = [];
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const txSelect = vi
        .fn()
        .mockReturnValueOnce(
          makeSelectChain([{ tier: "portfolio", status: "active" }]),
        )
        .mockReturnValueOnce(
          makeSelectChain([{ tier: "growth", status: "active" }]),
        )
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([{ userId: "outgoing-1" }]));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: txSelect,
            insert: vi.fn((table: unknown) => {
              insertedTables.push(table);
              return {
                values: vi.fn((row: Record<string, unknown>) => {
                  insertedRows.push(row);
                  return {
                    onConflictDoNothing: insertOnConflictDoNothing,
                  };
                }),
              };
            }),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(insertedTables).toHaveLength(2);
      expect(insertedTables[0]).toBe(communityMembers);
      expect(insertedTables[1]).toBe(boardTransitions);
      expect(insertedRows).toContainEqual(
        expect.objectContaining({
          communityId: "c1",
          role: "secretary",
          fromUserId: "outgoing-1",
          toUserId: "incoming-secretary",
          status: "pending",
          pendingItems: expect.arrayContaining([
            "Transfer custody of meeting minutes archive",
          ]),
        }),
      );
      expect(insertOnConflictDoNothing).toHaveBeenCalledTimes(2);
    });

    it("does not create a board transition when governance workflows are not available", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "incoming-secretary",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertedTables: unknown[] = [];
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi.fn(() =>
              makeSelectChain([{ tier: "starter", status: "active" }]),
            ),
            insert: vi.fn((table: unknown) => {
              insertedTables.push(table);
              return {
                values: vi.fn(() => ({
                  onConflictDoNothing: insertOnConflictDoNothing,
                })),
              };
            }),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(insertedTables).toHaveLength(1);
      expect(insertedTables[0]).toBe(communityMembers);
      expect(insertOnConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it("does not create a duplicate active transition for the same role", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "incoming-secretary",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertedTables: unknown[] = [];
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const txSelect = vi
        .fn()
        .mockReturnValueOnce(
          makeSelectChain([{ tier: "portfolio", status: "active" }]),
        )
        .mockReturnValueOnce(
          makeSelectChain([{ tier: "growth", status: "active" }]),
        )
        .mockReturnValueOnce(makeSelectChain([{ status: "pending" }]));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: txSelect,
            insert: vi.fn((table: unknown) => {
              insertedTables.push(table);
              return {
                values: vi.fn(() => ({
                  onConflictDoNothing: insertOnConflictDoNothing,
                })),
              };
            }),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(insertedTables).toHaveLength(1);
      expect(insertedTables[0]).toBe(communityMembers);
      expect(txSelect).toHaveBeenCalledTimes(3);
      expect(insertOnConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it("does not create a board transition for non-transition invitation roles", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "incoming-viewer",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "viewer",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });

      const insertedRows: Array<Record<string, unknown>> = [];
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "generated-membership-id" }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: vi
              .fn()
              .mockReturnValueOnce(
                makeSelectChain([{ tier: "portfolio", status: "active" }]),
              ),
            insert: vi.fn(() => ({
              values: vi.fn((row: Record<string, unknown>) => {
                insertedRows.push(row);
                return {
                  onConflictDoNothing: insertOnConflictDoNothing,
                };
              }),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined),
              })),
            })),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const res = await makeRequest(
        "/invitations/valid-tok/accept",
        { method: "POST" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(insertedRows).not.toContainEqual(
        expect.objectContaining({
          status: "pending",
          pendingItems: expect.any(Array),
        }),
      );
    });

    it("returns 500 when outgoing transition lookup fails unexpectedly", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "incoming-secretary",
          email: "invitee@example.com",
          emailVerified: true,
        },
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                token: "valid-tok",
                email: "invitee@example.com",
                communityId: "c1",
                role: "secretary",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 86400000),
              },
            ]),
          })),
        })),
      });
      const txSelect = vi
        .fn()
        .mockReturnValueOnce(
          makeSelectChain([{ tier: "growth", status: "active" }]),
        )
        .mockReturnValueOnce(makeSelectChain([]))
        .mockImplementationOnce(() => {
          throw new Error("transition lookup failed");
        });
      mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            select: txSelect,
            insert: vi.fn(),
            update: vi.fn(),
            execute: vi.fn(async () => undefined),
          };
          await fn(mockTx);
        },
      );

      const app = new Hono<{ Bindings: Env }>();
      app.route("/", communitiesRouter);
      app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));

      const res = await app.fetch(
        new Request("http://localhost/invitations/valid-tok/accept", {
          method: "POST",
        }),
        mockEnv,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "Internal server error",
      });
    });
  });
});
