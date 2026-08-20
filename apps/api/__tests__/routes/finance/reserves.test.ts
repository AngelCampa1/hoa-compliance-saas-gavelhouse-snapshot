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
const mockTransaction = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const reservesModule = await import("../../../src/routes/finance/reserves.js");
const reservesRouter = reservesModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", reservesRouter);
  app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

// Helper: mock membership returning specified role
function mockMembership(role: string) {
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

// Helper: mock no membership
function mockNoMembership() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
}

// Helper: mock community query returning a community with state
function mockCommunityWithState(state: string | null) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi
          .fn()
          .mockResolvedValue([{ id: "comm-1", name: "Test HOA", state }]),
      })),
    })),
  });
}

// Helper: mock no existing study
function mockNoStudy() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
}

// Helper: mock existing study
function mockExistingStudy(
  studyId = "study-1",
  overrides: Partial<{
    annualBudgetCents: number | null;
    annualReserveContributionCents: number | null;
    methodology: string | null;
    notes: string | null;
  }> = {},
) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: studyId,
            communityId: "comm-1",
            effectiveDate: "2025-01-01",
            methodology: "Full Funding",
            notes: null,
            annualBudgetCents: null,
            annualReserveContributionCents: null,
            ...overrides,
          },
        ]),
      })),
    })),
  });
}

// Helper: mock components for a study
function mockComponents(
  studyId = "study-1",
  components = [
    {
      id: "comp-1",
      studyId,
      name: "Roof",
      usefulLifeYears: 20,
      remainingLifeYears: 10,
      replacementCostCents: 5000000,
      currentReserveCents: 2500000,
    },
    {
      id: "comp-2",
      studyId,
      name: "Pool Deck",
      usefulLifeYears: 15,
      remainingLifeYears: 5,
      replacementCostCents: 3000000,
      currentReserveCents: 1000000,
    },
  ],
) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(components),
    })),
  });
}

// Helper: mock the conflict-safe activation upsert (insert().values().onConflictDoUpdate())
function mockActivationUpsert() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    })),
  });
}

describe("GET /finance/reserves/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest(
      "/finance/reserves/summary",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("returns null studyId when no study exists", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockNoStudy();

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      studyId: string | null;
      components: unknown[];
    };
    expect(body.studyId).toBeNull();
    expect(body.components).toHaveLength(0);
  });

  it("returns correct percentFunded after study is upserted", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState("CA");
    mockExistingStudy("study-1");
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      percentFunded: number;
      totalReserveBalance: number;
      totalProjectedNeed: number;
    };
    // 2500000 + 1000000 = 3500000 current, 5000000 + 3000000 = 8000000 projected
    expect(body.totalReserveBalance).toBe(3500000);
    expect(body.totalProjectedNeed).toBe(8000000);
    expect(body.percentFunded).toBeCloseTo(43.75);
  });

  it("GET /finance/reserves/summary is read-only: does not write to DB", async () => {
    // Fix 1.9: the GET handler must not write any DB rows.
    // Previously it wrote the communityActivation flag; this was moved to PUT.
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");
    mockCommunityWithState(null);
    mockExistingStudy("study-1");
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    // No inserts or updates should have been called
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("includes stateRequirements for community with CA state code", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockCommunityWithState("CA");
    mockNoStudy();

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stateRequirements: {
        stateCode: string;
        stateName: string;
        reserveStudyRequired: boolean;
      } | null;
    };
    expect(body.stateRequirements).not.toBeNull();
    expect(body.stateRequirements?.stateCode).toBe("CA");
    expect(body.stateRequirements?.stateName).toBe("California");
    expect(body.stateRequirements?.reserveStudyRequired).toBe(true);
  });

  it("returns stateRequirements: null for unknown state code", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockCommunityWithState("XX");
    mockNoStudy();

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stateRequirements: null };
    expect(body.stateRequirements).toBeNull();
  });

  it("keeps Fannie Mae compliance unknown when annual budget allocation is unavailable", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1");
    // totalReserveBalance = 1500000, totalProjectedNeed = 5000000 -> 30% funded,
    // but Fannie Mae compliance requires annual budget allocation input.
    mockComponents("study-1", [
      {
        id: "comp-1",
        studyId: "study-1",
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 1500000,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allocationPercent: number | null;
      fannieMaeCompliant: boolean | null;
      fannieMaeComplianceBasis: string | null;
    };
    expect(body.allocationPercent).toBeNull();
    expect(body.fannieMaeCompliant).toBeNull();
    expect(body.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
  });

  it("computes Fannie Mae compliance from explicit annual budget allocation", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      annualBudgetCents: number;
      annualReserveContributionCents: number;
      allocationPercent: number;
      fannieMaeCompliant: boolean;
      fannieMaeComplianceBasis: string;
    };
    expect(body.annualBudgetCents).toBe(12000000);
    expect(body.annualReserveContributionCents).toBe(1800000);
    expect(body.allocationPercent).toBeCloseTo(15);
    expect(body.fannieMaeCompliant).toBe(true);
    expect(body.fannieMaeComplianceBasis).toBe("annual_budget_allocation");
  });

  it("marks explicit annual budget allocation below 15 percent as non-compliant", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1200000,
    });
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allocationPercent: number;
      fannieMaeCompliant: boolean;
      fannieMaeComplianceBasis: string;
    };
    expect(body.allocationPercent).toBeCloseTo(10);
    expect(body.fannieMaeCompliant).toBe(false);
    expect(body.fannieMaeComplianceBasis).toBe("annual_budget_allocation");
  });

  it("does not label low percent-funded reserve studies as Fannie Mae non-compliant", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1");
    // totalReserveBalance = 500000, totalProjectedNeed = 5000000 -> 10% funded,
    // but Fannie Mae compliance requires annual budget allocation input.
    mockComponents("study-1", [
      {
        id: "comp-1",
        studyId: "study-1",
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 500000,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allocationPercent: number | null;
      fannieMaeCompliant: boolean | null;
      fannieMaeComplianceBasis: string | null;
    };
    expect(body.allocationPercent).toBeNull();
    expect(body.fannieMaeCompliant).toBeNull();
    expect(body.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
  });

  it("returns allocationPercent: null and fannieMaeCompliant: null when totalProjectedNeed is 0", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1");
    mockComponents("study-1", [
      {
        id: "comp-1",
        studyId: "study-1",
        name: "Parking",
        usefulLifeYears: 5,
        remainingLifeYears: 2,
        replacementCostCents: 0,
        currentReserveCents: 0,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allocationPercent: null;
      fannieMaeCompliant: null;
      fannieMaeComplianceBasis: string | null;
    };
    expect(body.allocationPercent).toBeNull();
    expect(body.fannieMaeCompliant).toBeNull();
    expect(body.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
  });

  it("percentFunded: null when totalProjectedNeed is 0", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockCommunityWithState(null);
    mockExistingStudy("study-1");
    // Components with zero replacement cost
    mockComponents("study-1", [
      {
        id: "comp-1",
        studyId: "study-1",
        name: "Parking",
        usefulLifeYears: 5,
        remainingLifeYears: 2,
        replacementCostCents: 0,
        currentReserveCents: 0,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { percentFunded: null };
    expect(body.percentFunded).toBeNull();
  });

  it("returns stateRequirements: null when community has no state", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");
    mockCommunityWithState(null);
    mockNoStudy();

    const res = await makeRequest(
      "/finance/reserves/summary?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stateRequirements: null };
    expect(body.stateRequirements).toBeNull();
  });
});

describe("PUT /finance/reserves/study", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockReset();
    // Default: transaction passes through using the same mocks
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          delete: mockDelete,
        }),
    );
  });

  const validStudyBody = {
    communityId: "comm-1",
    effectiveDate: "2025-01-01",
    methodology: "Full Funding",
    annualBudgetCents: 12000000,
    annualReserveContributionCents: 2400000,
    components: [
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ],
  };

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("upserts study and components (new study path — insert)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    // No existing study
    mockNoStudy();

    // Insert study
    const mockStudyValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockStudyValues });

    // Insert components
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert (runs before buildSummary)
    mockActivationUpsert();

    // summary fetch: community
    mockCommunityWithState("CA");
    // summary fetch: study
    mockExistingStudy("generated-id");
    // summary fetch: components
    mockComponents("generated-id", [
      {
        id: "generated-id",
        studyId: "generated-id",
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { studyId: string };
    expect(body.studyId).toBeDefined();
    expect(mockStudyValues).toHaveBeenCalledWith(
      expect.objectContaining({
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 2400000,
      }),
    );
    expect(mockCompValues).toHaveBeenCalledOnce();
  });

  it("flips reservePopulated via conflict-safe upsert", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockNoStudy();

    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    mockCommunityWithState("CA");
    mockExistingStudy("generated-id");
    mockComponents("generated-id");

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ reservePopulated: true }),
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("second PUT replaces components (existing study path)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    // Existing study found
    mockExistingStudy("study-1");

    // Update study
    const mockStudySet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockStudySet });

    // Delete old components
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValueOnce({ where: mockDeleteWhere });

    // Insert new components
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert (runs before buildSummary)
    mockActivationUpsert();

    // summary fetch: community
    mockCommunityWithState("CA");
    // summary fetch: study
    mockExistingStudy("study-1");
    // summary fetch: components
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validStudyBody,
          components: [
            ...validStudyBody.components,
            {
              name: "Pool",
              usefulLifeYears: 15,
              remainingLifeYears: 5,
              replacementCostCents: 3000000,
              currentReserveCents: 1000000,
            },
          ],
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockStudySet).toHaveBeenCalledWith(
      expect.objectContaining({
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 2400000,
      }),
    );
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
    expect(mockCompValues).toHaveBeenCalledOnce();
  });

  it("preserves existing allocation metadata when omitted from an update", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });

    const mockStudySet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockStudySet });
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockActivationUpsert();
    mockCommunityWithState("CA");
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    mockComponents("study-1");

    const {
      annualBudgetCents: _budget,
      annualReserveContributionCents: _contribution,
      ...body
    } = validStudyBody;
    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockStudySet).toHaveBeenCalledWith(
      expect.objectContaining({
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 1800000,
      }),
    );
  });

  it("falls back to null metadata when existing study metadata is also null", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockExistingStudy("study-1", {
      annualBudgetCents: null,
      annualReserveContributionCents: null,
      methodology: null,
      notes: null,
    });

    const mockStudySet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockStudySet });
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockActivationUpsert();
    mockCommunityWithState("CA");
    mockExistingStudy("study-1", {
      annualBudgetCents: null,
      annualReserveContributionCents: null,
    });
    mockComponents("study-1");

    const {
      annualBudgetCents: _budget,
      annualReserveContributionCents: _contribution,
      methodology: _methodology,
      ...body
    } = validStudyBody;
    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockStudySet).toHaveBeenCalledWith(
      expect.objectContaining({
        annualBudgetCents: null,
        annualReserveContributionCents: null,
        methodology: null,
        notes: null,
      }),
    );
  });

  it("returns 400 when body validation fails", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1", components: [] }),
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("wraps DELETE+INSERT in a db.transaction on update path (atomicity)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    // Existing study found → update path (delete + insert)
    mockExistingStudy("study-1");

    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockActivationUpsert();

    mockCommunityWithState("CA");
    mockExistingStudy("study-1");
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/study?communityId=comm-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validStudyBody),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe("PATCH /finance/reserves/allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates allocation metadata without replacing components", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockExistingStudy("study-1");

    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    mockCommunityWithState("CA");
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/allocation",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          annualBudgetCents: 12000000,
          annualReserveContributionCents: 1800000,
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith({
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("captures allocation update analytics with compliance result", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockExistingStudy("study-1");

    const mockSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockSet });

    mockCommunityWithState("CA");
    mockExistingStudy("study-1", {
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    mockComponents("study-1");

    const res = await makeRequest(
      "/finance/reserves/allocation",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          annualBudgetCents: 12000000,
          annualReserveContributionCents: 1800000,
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "reserve_allocation_updated",
      {
        allocation_percent: 15,
        community_id: "comm-1",
        fannie_mae_compliant: true,
        role: "treasurer",
        study_id: "study-1",
      },
      "user-1",
      mockEnv,
    );
  });

  it("returns 403 for viewer role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");

    const res = await makeRequest(
      "/finance/reserves/allocation",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          annualBudgetCents: 12000000,
          annualReserveContributionCents: 1800000,
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when allocation is saved before a reserve study exists", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockNoStudy();

    const res = await makeRequest(
      "/finance/reserves/allocation",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: "comm-1",
          annualBudgetCents: 12000000,
          annualReserveContributionCents: 1800000,
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /finance/reserve-study/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockReset();
    // Default: transaction passes through using the same mocks
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          delete: mockDelete,
        }),
    );
  });

  const validCsv = [
    "component,useful life,remaining life,replacement cost,current reserve",
    "Roof,20,10,50000,25000",
    "Pool Deck,15,5,30000,10000",
  ].join("\n");

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("viewer");

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("parses valid CSV and returns 201 with inserted count", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    // No existing study → insert study
    mockNoStudy();
    const mockStudyValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockStudyValues });

    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert
    mockActivationUpsert();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { inserted: number };
    expect(body.inserted).toBe(2);
  });

  it("captures reserve import analytics without component names or amounts", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    mockNoStudy();
    const mockStudyValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockStudyValues });
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert
    mockActivationUpsert();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "reserve_imported",
      {
        community_id: "comm-1",
        component_count: 2,
        error_count: 0,
        import_format: "csv",
        role: "treasurer",
        study_id: "generated-id",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Roof");
    expect(calls).not.toContain("Pool Deck");
    expect(calls).not.toContain("50000");
    expect(calls).not.toContain("25000");
  });

  it("flips reservePopulated via conflict-safe upsert on import", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockNoStudy();
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // activation upsert — insert().values().onConflictDoUpdate()
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflict })),
    });

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ reservePopulated: true }),
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("parses valid JSON array and returns 201", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    mockNoStudy();
    const mockStudyValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockStudyValues });
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert
    mockActivationUpsert();

    const jsonBody = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { inserted: number };
    expect(body.inserted).toBe(1);
  });

  it("returns 400 when content type header is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    const jsonBody = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ]);

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        body: jsonBody,
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 422 when all rows are invalid (CSV)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    const badCsv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      ",0,-1,-100,-200",
    ].join("\n");

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      { method: "POST", headers: { "Content-Type": "text/csv" }, body: badCsv },
      mockEnv,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: unknown[] };
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("returns 207 on partial import (some valid, some invalid rows)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    const partialCsv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,50000,25000",
      ",0,-1,-100,-200",
    ].join("\n");

    mockNoStudy();
    const mockStudyValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockStudyValues });
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert
    mockActivationUpsert();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: partialCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(207);
    const body = (await res.json()) as { inserted: number; errors: unknown[] };
    expect(body.inserted).toBe(1);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("returns 400 when Content-Type is unsupported", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "some data",
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest(
      "/finance/reserve-study/import",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
  });

  it("returns 201 with inserted:0 when CSV has header only (no data rows)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");

    const headerOnlyCsv =
      "component,useful life,remaining life,replacement cost,current reserve";

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: headerOnlyCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { inserted: number };
    expect(body.inserted).toBe(0);
  });

  it("handles existing study on import (updates rather than inserts)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");

    // Existing study
    mockExistingStudy("study-1");

    // Update study
    const mockStudySet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockUpdate.mockReturnValueOnce({ set: mockStudySet });

    // Delete old components
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValueOnce({ where: mockDeleteWhere });

    // Insert new components
    const mockCompValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockCompValues });

    // activation conflict-safe upsert
    mockActivationUpsert();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
  });

  it("CSV import wraps DELETE+INSERT in a db.transaction (atomicity)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("owner");

    // No existing study → insert path
    mockNoStudy();

    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockActivationUpsert();

    const res = await makeRequest(
      "/finance/reserve-study/import?communityId=comm-1",
      {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: validCsv,
      },
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});
