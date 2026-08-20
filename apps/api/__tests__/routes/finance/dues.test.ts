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
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
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

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
  captureException: vi.fn(),
}));

const mockPostEntry = vi.fn();
vi.mock("../../../src/domain/accounting/postEntry.js", () => ({
  postEntry: mockPostEntry,
}));

const mockSeed = vi.fn();
vi.mock("../../../src/domain/accounting/seed.js", () => ({
  seedDefaultChartOfAccounts: mockSeed,
}));

const {
  mockStripeCustomersCreate,
  mockStripePaymentIntentsCreate,
  mockStripePaymentIntentsRetrieve,
  mockStripePaymentIntentsCancel,
} = vi.hoisted(() => ({
  mockStripeCustomersCreate: vi.fn(),
  mockStripePaymentIntentsCreate: vi.fn(),
  mockStripePaymentIntentsRetrieve: vi.fn(),
  mockStripePaymentIntentsCancel: vi.fn(),
}));

vi.mock("../../../src/lib/stripe-client.js", () => ({
  createStripe: vi.fn(() => ({
    customers: { create: mockStripeCustomersCreate },
    paymentIntents: {
      create: mockStripePaymentIntentsCreate,
      retrieve: mockStripePaymentIntentsRetrieve,
      cancel: mockStripePaymentIntentsCancel,
    },
  })),
}));

const financeDuesModule = await import("../../../src/routes/finance/dues.js");
const financeDuesRouter = financeDuesModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", financeDuesRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

function collectSqlParamValues(
  value: unknown,
  seen = new Set<unknown>(),
): unknown[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (value.constructor.name === "Param") {
    return [(value as { value: unknown }).value];
  }

  return Object.values(value).flatMap((nestedValue) =>
    collectSqlParamValues(nestedValue, seen),
  );
}

// Recursively walks a drizzle SQL object (or anything) looking for a raw SQL
// fragment string that contains `needle`. The advisory-lock helper builds
// `sql`SELECT pg_advisory_xact_lock(...)``, whose literal text lives in a
// StringChunk's `value`, so a plain `String(query)` would not reveal it.
function sqlContainsText(
  value: unknown,
  needle: string,
  seen = new Set<unknown>(),
): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((nested) =>
    sqlContainsText(nested, needle, seen),
  );
}

// Shared membership mock helper
function mockMembership(role = "owner") {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi
          .fn()
          .mockResolvedValue([
            { communityId: "comm-1", userId: "user-1", role },
          ]),
      })),
    })),
  });
}

function mockNoMembership() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
}

function mockActiveTier(tier: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ tier, status: "active" }]),
      })),
    })),
  });
}

function mockAssessmentCount(total: number) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ total }]),
    })),
  });
}

function mockUnitInCommunity(unit: { id?: string; communityId?: string } = {}) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: unit.id ?? "unit-1",
            communityId: unit.communityId ?? "comm-1",
          },
        ]),
      })),
    })),
  });
}

function mockNoUnitInCommunity() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
}

function mockActiveHomeCount(value: number) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ value }]),
    })),
  });
}

async function withoutVitestMarker<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const original = process.env["VITEST_WORKER_ID"];
  delete process.env["VITEST_WORKER_ID"];
  try {
    return await callback();
  } finally {
    if (original === undefined) {
      delete process.env["VITEST_WORKER_ID"];
    } else {
      process.env["VITEST_WORKER_ID"] = original;
    }
  }
}

describe("GET /finance/units", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/units?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest("/finance/units", { method: "GET" }, mockEnv);
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/units?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with units array", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            id: "unit-1",
            communityId: "comm-1",
            address: "123 Main St",
            unitNumber: null,
            sqft: null,
            active: true,
          },
        ]),
      })),
    });
    const res = await makeRequest(
      "/finance/units?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { units: unknown[] };
    expect(Array.isArray(body.units)).toBe(true);
  });
});

describe("POST /finance/units", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
    // The unit-creation route wraps the cap check + insert in a transaction.
    // Pass the same shared mocks through so the queued mockSelect entries for
    // assertHomeLimit are consumed in order by the tx select calls.
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          execute: vi.fn(async () => undefined),
        }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          address: "123 Main St",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when address is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1" }),
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for viewer role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1", address: "123 Main St" }),
      },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when unit creation exceeds the home limit", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockActiveTier("growth");
    mockActiveHomeCount(200);

    const res = await withoutVitestMarker(() =>
      makeRequest(
        "/finance/units",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            address: "123 Main St",
          }),
        },
        mockEnv,
      ),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "limit_exceeded",
      limit: "homes",
      maximum: 200,
    });
  });

  it("returns 201 creates unit successfully", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockActiveTier("growth");
    mockActiveHomeCount(10);
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          address: "123 Main St",
          unitNumber: "1A",
          sqft: 800,
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { unitId: string };
    expect(body).toHaveProperty("unitId");
  });

  it("returns 201 creates unit without optional fields (null branches)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("admin");
    mockActiveTier("growth");
    mockActiveTier("growth");
    mockActiveHomeCount(10);
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          address: "456 Oak Ave",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ unitNumber: null, sqft: null }),
    );
  });

  it("acquires the home advisory lock as the FIRST statement, before the home-cap read", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockActiveTier("growth");

    // Capture call order: the lock SELECT (tx.execute) must run before the
    // assertHomeLimit count select. Both push to a shared ordered log so we can
    // assert pg_advisory_xact_lock was issued first.
    const order: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      order.push(
        sqlContainsText(query, "pg_advisory_xact_lock")
          ? "pg_advisory_xact_lock"
          : "execute:other",
      );
      return undefined;
    });
    mockTransaction.mockImplementationOnce(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          execute,
        }),
    );
    // assertHomeLimit count read — records its own order entry.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          order.push("homeCountRead");
          return [{ value: 10 }];
        }),
      })),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const res = await makeRequest(
      "/finance/units",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1", address: "1 Lock St" }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    // The advisory lock statement was issued at least once...
    const lockCall = execute.mock.calls.find((call) =>
      sqlContainsText(call[0], "pg_advisory_xact_lock"),
    );
    expect(lockCall).toBeDefined();
    // ...and it ran strictly before the guarded home-cap read.
    const lockIndex = order.indexOf("pg_advisory_xact_lock");
    const readIndex = order.indexOf("homeCountRead");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(readIndex);
  });
});

describe("GET /finance/homeowners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/homeowners",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with homeowners array", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              {
                id: "ho-1",
                communityId: "comm-1",
                firstName: "Jane",
                lastName: "Smith",
                email: "jane@example.com",
                unitId: null,
                unitNumber: null,
              },
            ]),
          })),
        })),
      })),
    });
    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { homeowners: unknown[] };
    expect(Array.isArray(body.homeowners)).toBe(true);
  });

  it("returns current unit assignment for each homeowner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              {
                id: "ho-1",
                communityId: "comm-1",
                firstName: "Jane",
                lastName: "Smith",
                email: "jane@example.com",
                unitId: "unit-1",
                unitNumber: "4B",
              },
            ]),
          })),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowners: Array<{ unitId: string | null; unitNumber: string | null }>;
    };
    expect(body.homeowners[0]).toMatchObject({
      unitId: "unit-1",
      unitNumber: "4B",
    });
  });

  it("queries only active homeowners for dues eligibility", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    const queryWhere = vi.fn().mockResolvedValue([
      {
        id: "ho-1",
        communityId: "comm-1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        active: true,
        unitId: "unit-1",
        unitNumber: "4B",
      },
    ]);
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: queryWhere,
          })),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(collectSqlParamValues(queryWhere.mock.calls[0]?.[0])).toEqual(
      expect.arrayContaining(["comm-1", true]),
    );
  });

  it("deduplicates overlapping current unit assignments per homeowner", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              {
                id: "ho-1",
                communityId: "comm-1",
                firstName: "Jane",
                lastName: "Smith",
                email: "jane@example.com",
                unitId: "unit-1",
                unitNumber: "4B",
              },
              {
                id: "ho-1",
                communityId: "comm-1",
                firstName: "Jane",
                lastName: "Smith",
                email: "jane@example.com",
                unitId: "unit-2",
                unitNumber: "5C",
              },
            ]),
          })),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/homeowners?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { homeowners: Array<{ id: string }> };
    expect(body.homeowners).toHaveLength(1);
    expect(body.homeowners[0].id).toBe("ho-1");
  });
});

describe("POST /finance/homeowners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/homeowners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/homeowners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          firstName: "Jane",
          lastName: "Smith",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/homeowners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 201 creates homeowner with Stripe customer", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");
    mockStripeCustomersCreate.mockResolvedValueOnce({ id: "cus_test123" });
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/homeowners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { homeownerId: string };
    expect(body).toHaveProperty("homeownerId");
    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        name: "Jane Smith",
      }),
    );
  });

  it("returns 201 even when Stripe throws — stripeCustomerId null", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockStripeCustomersCreate.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/homeowners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          firstName: "Bob",
          lastName: "Jones",
          email: "bob@example.com",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { homeownerId: string };
    expect(body).toHaveProperty("homeownerId");
    // Verify null was passed for stripeCustomerId
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: null }),
    );
  });

  it("does not apply home quota to homeowner-only creation", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");
    mockStripeCustomersCreate.mockResolvedValueOnce({ id: "cus_test123" });
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await withoutVitestMarker(() =>
      makeRequest(
        "/finance/homeowners",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
          }),
        },
        mockEnv,
      ),
    );

    expect(res.status).toBe(201);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "comm-1",
        email: "jane@example.com",
      }),
    );
  });
});

describe("GET /finance/assessments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
  });

  it("returns 400 when communityId missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/assessments",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/assessments?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 without period filter and includes pagination metadata", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    // rows query (fetches limit+1 to detect hasMore)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue([
                {
                  id: "assess-1",
                  communityId: "comm-1",
                  period: "2026-01",
                  amountCents: 15000,
                  status: "pending",
                },
              ]),
            })),
          })),
        })),
      })),
    });
    mockAssessmentCount(73);
    const res = await makeRequest(
      "/finance/assessments?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      assessments: unknown[];
      total: number;
      hasMore: boolean;
    };
    expect(Array.isArray(body.assessments)).toBe(true);
    expect(body.total).toBe(73);
    expect(body.hasMore).toBe(false);
  });

  it("returns 200 with period filter applied", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    // rows query
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    });
    mockAssessmentCount(0);
    const res = await makeRequest(
      "/finance/assessments?communityId=comm-1&period=2026-01",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when limit exceeds maximum of 200", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    const res = await makeRequest(
      "/finance/assessments?communityId=comm-1&limit=500",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it.each(["limit=1abc", "limit=1.5", "offset=2abc", "offset=1.5"])(
    "returns 400 for malformed pagination query %s",
    async (query) => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      mockMembership("viewer");

      const res = await makeRequest(
        `/finance/assessments?communityId=comm-1&${query}`,
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(400);
      expect(mockSelect).not.toHaveBeenCalled();
    },
  );

  it("respects custom limit and offset params and detects hasMore via extra row", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    // Return limit+1 rows (11 rows for limit=10) to signal hasMore=true
    const extraRows = Array.from({ length: 11 }, (_, i) => ({
      id: `assess-${i}`,
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 15000,
      status: "pending",
    }));
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue(extraRows),
            })),
          })),
        })),
      })),
    });
    mockAssessmentCount(31);
    const res = await makeRequest(
      "/finance/assessments?communityId=comm-1&limit=10&offset=20",
      { method: "GET" },
      mockEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      assessments: unknown[];
      total: number;
      hasMore: boolean;
    };
    // With limit=10 and 11 rows returned, hasMore should be true
    expect(body.hasMore).toBe(true);
    expect(body.total).toBe(31);
    // The page should contain exactly 10 items (not the extra probe row)
    expect(body.assessments).toHaveLength(10);
  });
});

describe("POST /finance/assessments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitId: "unit-1",
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitId: "unit-1",
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when owner-operations is not available for assessment creation", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("starter");

    const res = await withoutVitestMarker(() =>
      makeRequest(
        "/finance/assessments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            unitId: "unit-1",
            period: "2026-01",
            amountCents: 15000,
            fundType: "operating",
            dueDate: "2026-01-15",
          }),
        },
        mockEnv,
      ),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "growth",
    });
  });

  it("returns 400 when period format is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          period: "bad-period",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 + flips dueBatchConfigured via conflict-safe upsert", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");
    mockUnitInCommunity();

    // assessment insert
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitId: "unit-1",
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { assessmentId: string };
    expect(body).toHaveProperty("assessmentId");
    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ dueBatchConfigured: true }),
      }),
    );
    // No separate SELECT or UPDATE should have been issued for activation
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when unitId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          period: "2026-02",
          amountCents: 20000,
          fundType: "reserve",
          dueDate: "2026-02-01",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when unit is not in the assessment community", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");
    mockNoUnitInCommunity();

    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitId: "unit-from-other-community",
          period: "2026-02",
          amountCents: 20000,
          fundType: "reserve",
          dueDate: "2026-02-01",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 201 with unitId provided (covers unitId branch)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockUnitInCommunity();

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    // activation conflict-safe upsert
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    });

    const res = await makeRequest(
      "/finance/assessments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitId: "unit-1",
          period: "2026-02",
          amountCents: 20000,
          fundType: "reserve",
          dueDate: "2026-02-01",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: "unit-1" }),
    );
  });
});

describe("POST /finance/dues/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
    mockCaptureEvent.mockReset();
    mockTransaction.mockReset();
    // Default: transaction passes through to a tx object with the same mocks
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          execute: vi.fn(async () => undefined),
        }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when assessment not found", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    // Assessment query returns empty
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-missing",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when owner-operations is not available for dues payment collection", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("starter");

    const res = await withoutVitestMarker(() =>
      makeRequest(
        "/finance/dues/pay",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            assessmentId: "assess-1",
            homeownerId: "ho-1",
            amountCents: 15000,
            method: "check",
          }),
        },
        mockEnv,
      ),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "growth",
    });
  });

  it("returns 404 when homeowner not found", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner not found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-missing",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when assessment is already paid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: "unit-1",
              amountCents: 15000,
              fundType: "operating",
              status: "paid",
            },
          ]),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(409);
  });

  it("allows paying an assessment that is already past due", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_past_due",
      client_secret: "cs_past_due",
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "past_due",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: "cus_test",
            },
          ]),
        })),
      })),
    });
    // No existing pending payment
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
    // tx re-check under the advisory lock: lockedAssessment + lockedPaidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "past_due" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      clientSecret: "cs_past_due",
      paymentIntentId: "pi_past_due",
    });
  });

  it("returns 400 when payment amount exceeds outstanding balance (overpayment)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    // Assessment
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 20000, // more than the 15000 outstanding
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exceeds outstanding balance/);
  });

  it("returns 400 when payment amount is zero or negative", async () => {
    // payDuesInput enforces amountCents >= 1 at the validator, so a zero or
    // negative amount is rejected by zValidator before the handler runs.
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 0, // zero → rejected by schema validation
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 422 when homeowner does not own the assessed unit", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: "unit-1",
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: "cus_test",
            },
          ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(422);
  });

  it("returns 201 with method=check: creates payment + journal entry + paid status", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment found (operating fund)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: "cus_test",
            },
          ]),
        })),
      })),
    });
    // Revenue account (4000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4000", code: "4000", fundType: "operating" },
            ]),
        })),
      })),
    });
    // Cash account (1000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-1000", code: "1000", fundType: "operating" },
            ]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({ entryId: "entry-1", lineCount: 2 });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { paymentId: string };
    expect(body).toHaveProperty("paymentId");
    expect(mockSeed).toHaveBeenCalledWith(expect.any(Object), "comm-1");
    expect(mockPostEntry).toHaveBeenCalledOnce();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_payment_recorded",
      {
        amount_cents: 15000,
        assessment_id: "assess-1",
        community_id: "comm-1",
        fund_type: "operating",
        method: "check",
        paid_in_full: true,
        payment_id: "generated-id",
        role: "treasurer",
      },
      "user-1",
      mockEnv,
    );
  });

  it("returns 201 with method=card: creates pending payments row and returns clientSecret", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: "cus_test",
            },
          ]),
        })),
      })),
    });
    // No existing pending payment (fix 1.4 guard)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_test123",
      client_secret: "pi_test123_secret",
    });
    // tx re-check under the advisory lock: lockedAssessment + lockedPaidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      clientSecret: string;
      paymentIntentId: string;
    };
    expect(mockSeed).toHaveBeenCalledWith(expect.any(Object), "comm-1");
    expect(body).toHaveProperty("clientSecret");
    expect(body).toHaveProperty("paymentIntentId");
    expect(body.paymentIntentId).toBe("pi_test123");
    expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          method: "card",
        }),
      }),
    );
    // Pending payment row was inserted
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_test123",
        assessmentId: "assess-1",
        method: "card",
      }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_payment_started",
      {
        amount_cents: 15000,
        assessment_id: "assess-1",
        community_id: "comm-1",
        fund_type: "operating",
        method: "card",
        reused_pending: false,
        role: "owner",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("ho-1");
    expect(calls).not.toContain("cus_test");
  });

  it("returns 200 with existing PI when duplicate card payment requested (idempotency)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: "cus_test",
            },
          ]),
        })),
      })),
    });
    // Existing pending payment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "pay-1",
              stripePaymentIntentId: "pi_existing",
              method: "card",
            },
          ]),
        })),
      })),
    });

    mockStripePaymentIntentsRetrieve.mockResolvedValueOnce({
      id: "pi_existing",
      client_secret: "pi_existing_secret",
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );
    // Returns 200 (existing PI returned), not 201 (new PI)
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      clientSecret: string;
      paymentIntentId: string;
    };
    expect(body.paymentIntentId).toBe("pi_existing");
    // Stripe create was NOT called (using existing PI)
    expect(mockStripePaymentIntentsCreate).not.toHaveBeenCalled();
    expect(mockStripePaymentIntentsRetrieve).toHaveBeenCalledWith(
      "pi_existing",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_payment_started",
      {
        amount_cents: 15000,
        assessment_id: "assess-1",
        community_id: "comm-1",
        fund_type: "operating",
        method: "card",
        reused_pending: true,
        role: "owner",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("ho-1");
    expect(calls).not.toContain("cus_test");
    expect(calls).not.toContain("pi_existing");
    expect(calls).not.toContain("pi_existing_secret");
  });

  it("scopes the pending-PI reuse lookup to the exact request (homeowner + amount + still-pending), not just assessment + method", async () => {
    // Walks a drizzle SQL/condition tree and collects referenced column names.
    function collectColumnNames(
      node: unknown,
      acc = new Set<string>(),
      seen = new Set<unknown>(),
    ): Set<string> {
      if (!node || typeof node !== "object" || seen.has(node)) return acc;
      seen.add(node);
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" && obj.table) acc.add(obj.name);
      for (const [key, value] of Object.entries(obj)) {
        // Do NOT descend into a column's owning `table` — it references every
        // sibling column and would falsely report columns the predicate never
        // touches. We only want columns that appear as operands in the tree.
        if (key === "table") continue;
        if (Array.isArray(value)) {
          for (const child of value) collectColumnNames(child, acc, seen);
        } else if (value && typeof value === "object") {
          collectColumnNames(value, acc, seen);
        }
      }
      return acc;
    }

    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
          ]),
        })),
      })),
    });
    // Reuse lookup — capture the predicate passed to .where(); return no row so
    // the handler proceeds to create a fresh PI.
    let reuseWhereArg: unknown;
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn((arg: unknown) => {
          reuseWhereArg = arg;
          return { limit: vi.fn().mockResolvedValue([]) };
        }),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_fresh",
      client_secret: "pi_fresh_secret",
    });
    // tx re-check under the advisory lock: lockedAssessment + lockedPaidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 9000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const names = collectColumnNames(reuseWhereArg);
    // The original guard only matched assessment_id + method, so a second
    // homeowner — or the same homeowner paying a different amount, or a re-pay
    // after the first PI already succeeded — would get back the WRONG PI.
    expect(names.has("assessment_id")).toBe(true);
    expect(names.has("method")).toBe(true);
    expect(names.has("homeowner_id")).toBe(true);
    expect(names.has("amount_cents")).toBe(true);
    expect(names.has("journal_entry_id")).toBe(true);
  });

  it("returns 201 with method=ach: creates pending payments row", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 5000,
              fundType: "reserve",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "ho-1",
              communityId: "comm-1",
              stripeCustomerId: null,
            },
          ]),
        })),
      })),
    });
    // No existing pending payment
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_ach123",
      client_secret: "pi_ach123_secret",
    });
    // tx re-check under the advisory lock: lockedAssessment + lockedPaidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 5000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 5000,
          method: "ach",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_payment_started",
      {
        amount_cents: 5000,
        assessment_id: "assess-1",
        community_id: "comm-1",
        fund_type: "reserve",
        method: "ach",
        reused_pending: false,
        role: "owner",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("ho-1");
    expect(calls).not.toContain("pi_ach123");
    expect(calls).not.toContain("pi_ach123_secret");
  });

  it("returns 422 when revenue account not found for check payment", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account missing
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when cash account not found for check payment", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "reserve",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account found (4100)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4100", code: "4100", fundType: "reserve" },
            ]),
        })),
      })),
    });
    // Cash account missing
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "other",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(422);
  });

  it("wraps postEntry + payment insert + assessment update in a single db.transaction (atomicity)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account (4000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4000", code: "4000", fundType: "operating" },
            ]),
        })),
      })),
    });
    // Cash account (1000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-1000", code: "1000", fundType: "operating" },
            ]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({ entryId: "entry-txn", lineCount: 2 });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    // The three writes must have occurred inside a single db.transaction call
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockPostEntry).toHaveBeenCalledOnce();
  });

  // Partial payment tests
  it("partial payment: accepts amount < outstanding, keeps status pending", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment for 15000
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — 5000 already paid, 10000 outstanding
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 5000 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-4000", code: "4000" }]),
        })),
      })),
    });
    // Cash account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-1000", code: "1000" }]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 5000 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({
      entryId: "entry-partial",
      lineCount: 2,
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 4000, // partial — less than 10000 outstanding
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    // Status should remain pending (not yet fully paid)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("partial payment against a past_due assessment preserves past_due (does not silently clear the arrears flag)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment is past_due (e.g. a prior Stripe dues payment failed).
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 10000,
              fundType: "operating",
              status: "past_due",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet, full 10000 outstanding
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-4000", code: "4000" }]),
        })),
      })),
    });
    // Cash account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-1000", code: "1000" }]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 10000, status: "past_due" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({
      entryId: "entry-pastdue-partial",
      lineCount: 2,
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 3000, // partial — less than 10000 outstanding
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    // A partial payment must NOT change the classification — the assessment is
    // still overdue, so it must stay past_due (not be demoted to pending, which
    // would drop it out of the overdue portfolio rollup).
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
  });

  it("second partial completing the balance: flips status to paid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment for 15000
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — 5000 already paid, 10000 outstanding
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 5000 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-4000", code: "4000" }]),
        })),
      })),
    });
    // Cash account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-1000", code: "1000" }]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 5000 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({
      entryId: "entry-final",
      lineCount: 2,
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 10000, // pays off remaining balance exactly
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    // Status should flip to paid
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    );
  });

  it("exact full payment with no prior payments: flips status to paid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment for 15000
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // paidRow — nothing paid yet
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-4000", code: "4000" }]),
        })),
      })),
    });
    // Cash account
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "acc-1000", code: "1000" }]),
        })),
      })),
    });

    // tx re-check: lockedAssessment and lockedPaidRow under advisory lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    mockPostEntry.mockResolvedValueOnce({
      entryId: "entry-full",
      lineCount: 2,
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    );
  });

  it("rejects with 409 when the assessment becomes non-payable under the lock", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Pre-lock: assessment is pending (passes the fast-fail check)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // Pre-lock paidRow — nothing paid yet (outstanding = 15000, sufficient for amount 15000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account (4000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4000", code: "4000", fundType: "operating" },
            ]),
        })),
      })),
    });
    // Cash account (1000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-1000", code: "1000", fundType: "operating" },
            ]),
        })),
      })),
    });

    // Under the lock: lockedAssessment re-read returns status "paid" (a concurrent payment settled it)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "paid" }]),
        })),
      })),
    });
    // lockedPaidRow is not reached (throw happens before it), but add a stub in
    // case the implementation order ever changes, so the queue doesn't bleed.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 15000 }]),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Assessment is not payable");
  });

  it("rejects with 400 when a concurrent payment consumed the balance under the lock", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Pre-lock: assessment is pending (passes the fast-fail check)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // Pre-lock paidRow — 5000 already paid, outstanding = 10000, request amount = 9000 passes
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 5000 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account (4000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4000", code: "4000", fundType: "operating" },
            ]),
        })),
      })),
    });
    // Cash account (1000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-1000", code: "1000", fundType: "operating" },
            ]),
        })),
      })),
    });

    // Under the lock: lockedAssessment still pending (status check passes)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    // Under the lock: lockedPaidRow shows a concurrent payment settled 14000 cents
    // so lockedOutstandingCents = 15000 - 14000 = 1000, which is < amountCents (9000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 14000 }]),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 9000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exceeds outstanding balance of \d+ cents/);
  });

  it("re-throws unexpected errors from inside the transaction (non-DuesPaymentError)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Pre-lock selects to reach the transaction
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // Pre-lock paidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue account (4000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-4000", code: "4000", fundType: "operating" },
            ]),
        })),
      })),
    });
    // Cash account (1000)
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "acc-1000", code: "1000", fundType: "operating" },
            ]),
        })),
      })),
    });

    // Make the transaction itself throw a generic (non-DuesPaymentError) error
    const dbError = new Error("unexpected db failure");
    mockTransaction.mockRejectedValueOnce(dbError);

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );
    // The error is re-thrown (not caught as DuesPaymentError), so Hono returns 500
    expect(res.status).toBe(500);
  });

  it("check path acquires the assessment lock BEFORE the under-lock re-read", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Assessment found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // pre-lock paidRow
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: null },
            ]),
        })),
      })),
    });
    // Revenue + cash accounts
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: "acc-4000", code: "4000" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: "acc-1000", code: "1000" }]),
        })),
      })),
    });

    const order: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      order.push(
        sqlContainsText(query, "pg_advisory_xact_lock")
          ? "pg_advisory_xact_lock"
          : "execute:other",
      );
      return undefined;
    });
    mockTransaction.mockImplementationOnce(
      async (callback: (tx: unknown) => unknown) =>
        callback({ insert: mockInsert, select: mockSelect, update: mockUpdate, execute }),
    );
    // Under-lock re-read: lockedAssessment records its order; lockedPaidRow.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            order.push("lockedAssessmentRead");
            return [{ amountCents: 15000, status: "pending" }];
          }),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockPostEntry.mockResolvedValueOnce({ entryId: "entry-1", lineCount: 2 });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "check",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const lockIndex = order.indexOf("pg_advisory_xact_lock");
    const readIndex = order.indexOf("lockedAssessmentRead");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(readIndex);
  });

  it("ach/card: rejects concurrent over-reservation under the lock (400) and cancels the orphan PI", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    // Assessment found — outstanding 15000 at the pre-lock check
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    // pre-lock paidRow — nothing paid yet, so the pre-lock check passes
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    // Homeowner found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
            ]),
        })),
      })),
    });
    // No existing pending payment
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_orphan",
      client_secret: "pi_orphan_secret",
    });
    mockStripePaymentIntentsCancel.mockResolvedValueOnce({
      id: "pi_orphan",
      status: "canceled",
    });

    // Under-lock re-read: a concurrent sibling already reserved the full amount,
    // so lockedPaidRow shows 15000 paid → outstanding 0 → this request exceeds.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 15000 }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exceeds outstanding balance of 0 cents/);
    // The orphan PI was canceled before returning the rejection.
    expect(mockStripePaymentIntentsCancel).toHaveBeenCalledWith("pi_orphan");
    // No pending reservation row was inserted for the rejected request.
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("ach/card: rejects when assessment became unpayable under the lock (409) and cancels the PI", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
            ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_late",
      client_secret: "pi_late_secret",
    });
    // Cancel itself fails — must be swallowed so the 409 is still returned.
    mockStripePaymentIntentsCancel.mockRejectedValueOnce(
      new Error("already captured"),
    );

    // Under the lock the assessment is now paid → not payable.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "paid" }]),
        })),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "ach",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Assessment is not payable",
    });
    expect(mockStripePaymentIntentsCancel).toHaveBeenCalledWith("pi_late");
    expect(mockValues).not.toHaveBeenCalled();
    // The swallowed cancel failure emits a reconciliation signal so the orphan
    // capturable PI is recoverable.
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_payment_pi_cancel_failed",
      {
        community_id: "comm-1",
        assessment_id: "assess-1",
        pi_id: "pi_late",
      },
      "user-1",
      expect.anything(),
    );
  });

  it("ach/card: a non-DuesPaymentError inside the reservation tx propagates as 500 and does NOT cancel the PI", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
            ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_boom",
      client_secret: "pi_boom_secret",
    });

    // The transaction itself throws a generic (non-DuesPaymentError) failure.
    mockTransaction.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(500);
    // A generic failure is rethrown, not translated — and we do NOT cancel the
    // PI for a non-rejection error (the reservation outcome is unknown).
    expect(mockStripePaymentIntentsCancel).not.toHaveBeenCalled();
  });

  it("ach/card happy path: treats a missing locked paidRow as zero paid (nullish fallback)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
            ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_zero",
      client_secret: "pi_zero_secret",
    });
    // lockedAssessment under the lock
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ amountCents: 15000, status: "pending" }]),
        })),
      })),
    });
    // lockedPaidRow returns NO row → `lockedPaidRow?.paidCents ?? 0` fallback.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ stripePaymentIntentId: "pi_zero" }),
    );
  });

  it("ach/card happy path: inserts the pending reservation row INSIDE the locked tx and does not cancel the PI", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "assess-1",
              communityId: "comm-1",
              unitId: null,
              amountCents: 15000,
              fundType: "operating",
              status: "pending",
            },
          ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: "ho-1", communityId: "comm-1", stripeCustomerId: "cus_test" },
            ]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    mockStripePaymentIntentsCreate.mockResolvedValueOnce({
      id: "pi_ok",
      client_secret: "pi_ok_secret",
    });

    // The insert must happen inside the tx (after the lock). Capture order.
    const order: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      order.push(
        sqlContainsText(query, "pg_advisory_xact_lock")
          ? "pg_advisory_xact_lock"
          : "execute:other",
      );
      return undefined;
    });
    const txInsertValues = vi.fn(async () => {
      order.push("reservationInsert");
      return undefined;
    });
    const txInsert = vi.fn(() => ({ values: txInsertValues }));
    const txSelect = vi.fn();
    mockTransaction.mockImplementationOnce(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: txInsert,
          select: txSelect,
          update: mockUpdate,
          execute,
        }),
    );
    // Under-lock re-read on the tx-scoped select.
    txSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            order.push("lockedAssessmentRead");
            return [{ amountCents: 15000, status: "pending" }];
          }),
        })),
      })),
    });
    txSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ paidCents: 0 }]),
      })),
    });

    const res = await makeRequest(
      "/finance/dues/pay",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          assessmentId: "assess-1",
          homeownerId: "ho-1",
          amountCents: 15000,
          method: "card",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      clientSecret: string;
      paymentIntentId: string;
    };
    expect(body.paymentIntentId).toBe("pi_ok");
    // The PI was NOT canceled on the happy path.
    expect(mockStripePaymentIntentsCancel).not.toHaveBeenCalled();
    // The reservation row was inserted on the tx-scoped insert (under the lock),
    // not on the top-level db.insert.
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_ok",
        assessmentId: "assess-1",
        method: "card",
        journalEntryId: null,
      }),
    );
    // Lock first, then re-read, then the reservation insert.
    const lockIndex = order.indexOf("pg_advisory_xact_lock");
    const readIndex = order.indexOf("lockedAssessmentRead");
    const insertIndex = order.indexOf("reservationInsert");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(readIndex);
    expect(readIndex).toBeLessThan(insertIndex);
  });
});

describe("POST /finance/assessments/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockPostEntry.mockReset();
    mockTransaction.mockReset();
    // Default transaction: pass-through to same mock functions
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          execute: vi.fn(async () => undefined),
        }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-2"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();
    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when user has read-only role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when request body is invalid (missing period)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1"],
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when unitIds is empty", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: [],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 and inserts all assessments in a single transaction", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // unit ownership validation — both units belong to comm-1
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }, { id: "unit-2" }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    // Two assessment inserts inside the transaction
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockInsert.mockReturnValueOnce({ values: mockValues });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-2"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { assessmentIds: string[] };
    expect(Array.isArray(body.assessmentIds)).toBe(true);
    expect(body.assessmentIds).toHaveLength(2);
    // All inserts happened inside the transaction
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ dueBatchConfigured: true }),
      }),
    );
  });

  it("captures dues batch analytics without unit ids", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }, { id: "unit-2" }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockInsert.mockReturnValueOnce({ values: mockValues });

    // activation upsert — insert().values().onConflictDoUpdate()
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-2"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "dues_batch_created",
      {
        amount_cents: 15000,
        assessment_count: 2,
        community_id: "comm-1",
        distinct_unit_count: 2,
        fund_type: "operating",
        period: "2026-01",
        role: "treasurer",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("unit-1");
    expect(calls).not.toContain("unit-2");
  });

  it("returns 400 and writes nothing when a unitId belongs to another community (IDOR guard)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("portfolio");

    // Only 1 of 2 units belongs to comm-1; the other is from a foreign community.
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }]),
      })),
    });

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-foreign"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unit must belong to the assessment community");

    // No transaction was opened and no inserts occurred
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rolls back all inserts when transaction throws mid-batch (atomicity)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("portfolio");

    // unit ownership validation passes
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }, { id: "unit-2" }]),
      })),
    });

    // Make the failure happen INSIDE the transaction callback:
    // first tx.insert resolves, second rejects — proving partial writes are rolled back.
    const mockValuesFirst = vi.fn().mockResolvedValue(undefined);
    const mockValuesSecond = vi
      .fn()
      .mockRejectedValue(new Error("DB constraint violation"));
    mockTransaction.mockImplementationOnce(
      async (callback: (tx: { insert: typeof mockInsert }) => unknown) => {
        // Wire up per-call responses inside the tx object
        mockInsert
          .mockReturnValueOnce({ values: mockValuesFirst })
          .mockReturnValueOnce({ values: mockValuesSecond });
        return callback({ insert: mockInsert });
      },
    );

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-2"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );

    // (a) handler surfaces 500
    expect(res.status).toBe(500);

    // (b) the second insert was attempted but threw — first attempted too
    expect(mockValuesFirst).toHaveBeenCalledOnce();
    expect(mockValuesSecond).toHaveBeenCalledOnce();

    // (c) no out-of-transaction writes ran (activation flip never executed)
    // mockInsert was only called inside the tx; mockUpdate never called
    expect(mockUpdate).not.toHaveBeenCalled();
    // mockSelect was called exactly three times: once for requireWriteMembership,
    // once for assertFeatureTier, and once for the unit ownership check —
    // all happen before the transaction. The activation lookup never ran.
    expect(mockSelect).toHaveBeenCalledTimes(3);
  });

  it("flips dueBatchConfigured via conflict-safe upsert", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockActiveTier("portfolio");

    // unit ownership validation — unit-1 belongs to comm-1
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }]),
      })),
    });

    // transaction insert for the one assessment
    const mockAssessmentValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockAssessmentValues });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1"],
          period: "2026-02",
          amountCents: 10000,
          fundType: "reserve",
          dueDate: "2026-02-01",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ dueBatchConfigured: true }),
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("inserts exactly once when unitIds contains a duplicate (dedup guard)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockActiveTier("growth");

    // Unit ownership validation: one distinct unit found, matches distinctUnitIds length of 1
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "unit-1" }]),
      })),
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    // Only one assessment insert should occur (for the single distinct unit)
    mockInsert.mockReturnValueOnce({ values: mockValues });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    const res = await makeRequest(
      "/finance/assessments/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          unitIds: ["unit-1", "unit-1"],
          period: "2026-01",
          amountCents: 15000,
          fundType: "operating",
          dueDate: "2026-01-15",
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { assessmentIds: string[] };
    // Duplicate input should yield exactly 1 assessment id
    expect(body.assessmentIds).toHaveLength(1);
    // The insert.values mock must have been called exactly once, not twice
    expect(mockValues).toHaveBeenCalledTimes(1);
  });
});
