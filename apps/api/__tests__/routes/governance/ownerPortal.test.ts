import { describe, it, expect, vi, beforeEach } from "vitest";

// Makes a where result that supports both select-chain await and update.where().returning() chain
function makeWhereResult(data: unknown[]) {
  const returningFn = vi.fn().mockResolvedValue(data);
  const result = {
    returning: returningFn,
    limit: vi.fn().mockResolvedValue(data),
    then(
      onFulfilled: (v: unknown[]) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(data).then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve(data).catch(onRejected);
    },
    finally(onFinally: () => void) {
      return Promise.resolve(data).finally(onFinally);
    },
  };
  return result;
}

const whereQueue: unknown[][] = [];
let whereCallIdx = 0;

const {
  mockBuildOwnerPortalInviteEmail,
  mockCheckoutSessionsCreate,
  mockSendOwnerPortalInviteEmail,
} = vi.hoisted(() => ({
  mockBuildOwnerPortalInviteEmail: vi.fn().mockResolvedValue({
    from: "Gavelhouse <angel.campa@gavelhouse.app>",
    to: "jane@example.com",
    subject: "Your owner portal link",
    html: "<p>portal</p>",
    text: "portal",
  }),
  mockCheckoutSessionsCreate: vi.fn().mockResolvedValue({
    url: "https://checkout.stripe.test/session_owner",
  }),
  mockSendOwnerPortalInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockInsertReturning = vi
  .fn()
  .mockResolvedValue([
    { id: "s1", token: "tok123", expiresAt: new Date(Date.now() + 86400000) },
  ]);

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  }),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: mockInsertReturning,
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("../../../src/db/client.js", () => ({ createDb: vi.fn(() => mockDb) }));
vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  })),
}));
vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "test-id"),
}));
vi.mock("../../../src/lib/stripe-client.js", () => ({
  createStripe: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: "pi_owner",
        client_secret: "pi_owner_secret",
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: "pi_existing",
        client_secret: "pi_existing_secret",
      }),
    },
  })),
}));
vi.mock("../../../src/domain/accounting/seed.js", () => ({
  seedDefaultChartOfAccounts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/domain/governance/ownerPortalInvite.js", () => ({
  buildOwnerPortalInviteEmail: (...args: unknown[]) =>
    mockBuildOwnerPortalInviteEmail(...args),
  sendOwnerPortalInviteEmail: (...args: unknown[]) =>
    mockSendOwnerPortalInviteEmail(...args),
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());
const mockCaptureException = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
  captureException: mockCaptureException,
}));

import router from "../../../src/routes/governance/ownerPortal.js";
import { getAuth } from "../../../src/lib/auth.js";

const mockGetAuth = vi.mocked(getAuth) as unknown as ReturnType<typeof vi.fn>;

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

function mockSession(userId: string | null) {
  mockGetAuth.mockReturnValueOnce({
    api: {
      getSession: vi
        .fn()
        .mockResolvedValue(userId ? { user: { id: userId } } : null),
    },
  } as unknown as ReturnType<typeof getAuth>);
}

// Simulate a valid portal session in the middleware:
// calls: (1) select session, (2) assertFeatureTier tier lookup, (3) update.set.where (lastUsedAt)
function mockValidToken(homeownerId = "h1", communityId = "c1") {
  const future = new Date(Date.now() + 86400000);
  whereQueue.push([
    { id: "sess1", homeownerId, communityId, token: "good", expiresAt: future },
  ]);
  whereQueue.push([{ tier: "portfolio", status: "active" }]); // assertFeatureTier
  whereQueue.push([]); // update lastUsedAt - where result not used
}

function mockActiveTier(tier: string) {
  whereQueue.push([{ tier, status: "active" }]);
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

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockCheckoutSessionsCreate.mockResolvedValue({
    url: "https://checkout.stripe.test/session_owner",
  });
  mockBuildOwnerPortalInviteEmail.mockResolvedValue({
    from: "Gavelhouse <angel.campa@gavelhouse.app>",
    to: "jane@example.com",
    subject: "Your owner portal link",
    html: "<p>portal</p>",
    text: "portal",
  });
  mockSendOwnerPortalInviteEmail.mockResolvedValue(undefined);
  mockInsertReturning.mockResolvedValue([
    { id: "s1", token: "tok123", expiresAt: new Date(Date.now() + 86400000) },
  ]);
  whereQueue.length = 0;
  whereCallIdx = 0;
  mockDb.where.mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  });
  // Default: no auth session
  mockGetAuth.mockReturnValue({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  } as unknown as ReturnType<typeof getAuth>);
});

describe("POST /owner/sessions (board issues token)", () => {
  it("returns 401 without board auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 403 if user not in community", async () => {
    mockSession("u1");
    // whereQueue is empty → no membership
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 404 if homeowner not found in community", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]); // membership
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([]); // homeowner not found
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h99", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("returns 404 if homeowner is inactive", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]);
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([
      { id: "h1", communityId: "c1", firstName: "Jane", active: false },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Homeowner not found",
    });
  });
  it("returns 403 if caller is a viewer", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "viewer", communityId: "c1" }]);
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 201 with token when all valid", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]); // membership
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([{ id: "h1", communityId: "c1", firstName: "Jane" }]); // homeowner
    mockInsertReturning.mockResolvedValueOnce([
      { id: "s1", token: "tok123", expiresAt: new Date(Date.now() + 86400000) },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));
    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("tok123");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_session_created",
      {
        community_id: "c1",
        invite_sent: false,
        role: "admin",
        session_id: "s1",
      },
      "u1",
      undefined,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("tok123");
    expect(calls).not.toContain("h1");
  });
  it("expires prior active sessions for the homeowner before creating a new token", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]);
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([
      { id: "h1", communityId: "c1", firstName: "Jane", active: true },
    ]);
    mockInsertReturning.mockResolvedValueOnce([
      { token: "tok-new", expiresAt: new Date(Date.now() + 86400000) },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith({
      expiresAt: expect.any(Date),
    });
    expect(mockDb.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.insert.mock.invocationCallOrder[0]!,
    );
  });
  it("sends an owner portal invite email when requested", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]);
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([
      {
        id: "h1",
        communityId: "c1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        active: true,
      },
    ]);
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: "s-email",
        token: "tok-email",
        expiresAt: new Date("2026-06-18T12:00:00.000Z"),
      },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({
          homeownerId: "h1",
          communityId: "c1",
          sendEmail: true,
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {
        APP_URL: "https://owners.example",
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St",
        RESEND_API_KEY: "resend_test",
      },
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      token: "tok-email",
      sent: true,
    });
    expect(mockBuildOwnerPortalInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Jane",
        email: "jane@example.com",
        communityName: expect.any(String),
        portalUrl: "https://owners.example/portal?token=tok-email",
      }),
      expect.objectContaining({
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St",
      }),
    );
    expect(mockSendOwnerPortalInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" }),
      "resend_test",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_session_created",
      {
        community_id: "c1",
        invite_sent: true,
        role: "admin",
        session_id: "s-email",
      },
      "u1",
      expect.objectContaining({
        APP_URL: "https://owners.example",
      }),
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("tok-email");
    expect(calls).not.toContain("jane@example.com");
    expect(calls).not.toContain("https://owners.example/portal");
  });

  it("returns a generated link with sent false when invite email delivery fails", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "admin", communityId: "c1" }]);
    mockActiveTier("portfolio"); // assertFeatureTier
    whereQueue.push([
      {
        id: "h1",
        communityId: "c1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        active: true,
      },
    ]);
    mockInsertReturning.mockResolvedValueOnce([
      {
        token: "tok-fallback",
        expiresAt: new Date("2026-06-18T12:00:00.000Z"),
      },
    ]);
    mockSendOwnerPortalInviteEmail.mockRejectedValueOnce(
      new Error("resend unavailable"),
    );

    const res = await router.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({
          homeownerId: "h1",
          communityId: "c1",
          sendEmail: true,
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {
        APP_URL: "https://owners.example",
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St",
        RESEND_API_KEY: "resend_test",
      },
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      token: "tok-fallback",
      sent: false,
    });
    expect(mockBuildOwnerPortalInviteEmail).toHaveBeenCalled();
    expect(mockSendOwnerPortalInviteEmail).toHaveBeenCalled();
  });
});

describe("GET /owner/me (homeowner portal)", () => {
  it("returns 401 without token", async () => {
    const res = await router.fetch(new Request("http://localhost/owner/me"));
    expect(res.status).toBe(401);
  });
  it("returns 401 with expired/invalid token", async () => {
    whereQueue.push([]); // session not found
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "bad-token" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 403 when an existing token is used after downgrade below Growth", async () => {
    whereQueue.push([
      {
        id: "sess1",
        homeownerId: "h1",
        communityId: "c1",
        token: "good",
        expiresAt: new Date(Date.now() + 86400000),
      },
    ]);
    mockActiveTier("starter");
    const res = await withoutVitestMarker(() =>
      router.fetch(
        new Request("http://localhost/owner/me", {
          headers: { "x-owner-token": "good" },
        }),
      ),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "growth",
    });
  });
  it("returns 404 when homeowner not found", async () => {
    mockValidToken();
    whereQueue.push([]); // homeowner not found
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("returns 200 with unit-scoped assessments for homeowner with owned units", async () => {
    mockValidToken();
    whereQueue.push([{ id: "h1", firstName: "Jane", lastName: "Smith" }]); // homeowner
    whereQueue.push([{ unitId: "u1" }, { unitId: "u2" }]); // unitOwnerships
    whereQueue.push([
      { id: "u1", unitNumber: "101" },
      { id: "u2", unitNumber: "102" },
    ]); // active units
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: "u1",
        amountCents: 10000,
        period: "April dues",
        dueDate: "2026-04-30",
        status: "pending",
      },
    ]); // assessments for owned units + community-wide
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowner: unknown;
      assessments: unknown[];
    };
    expect(body.homeowner).toEqual(
      expect.objectContaining({ unitId: "u1", unitNumber: "101" }),
    );
    expect(body.assessments).toEqual([
      {
        id: "a1",
        description: "April dues",
        amountCents: 10000,
        dueDate: "2026-04-30",
        status: "pending",
      },
    ]);
  });
  it("returns 200 with empty assessments when homeowner has no owned units (no leakage of null-unitId rows)", async () => {
    mockValidToken();
    whereQueue.push([{ id: "h1", firstName: "Jane", lastName: "Smith" }]); // homeowner
    whereQueue.push([]); // unitOwnerships — no units owned
    // No assessments query is made when there are no owned units (short-circuit)
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowner: unknown;
      assessments: unknown[];
    };
    expect(body.homeowner).toBeDefined();
    // Empty — homeowner with no units sees no assessments
    expect(body.assessments).toEqual([]);
  });

  it("returns community-wide assessments for homeowners without owned units", async () => {
    mockValidToken();
    whereQueue.push([{ id: "h1", firstName: "Jane", lastName: "Smith" }]);
    whereQueue.push([]);
    whereQueue.push([
      {
        id: "a-wide",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        period: "Community dues",
        dueDate: "2026-05-31",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assessments: unknown[] };
    expect(body.assessments).toEqual([
      {
        id: "a-wide",
        description: "Community dues",
        amountCents: 10000,
        dueDate: "2026-05-31",
        status: "pending",
      },
    ]);
  });

  it("homeowner A cannot see homeowner B's unit-specific assessments", async () => {
    // Homeowner A owns unit-a. Assessment is on unit-b (homeowner B's unit).
    // Expected: homeowner A sees empty assessments.
    mockValidToken("h-a", "c1");
    whereQueue.push([{ id: "h-a", firstName: "Alice", lastName: "Adams" }]); // homeowner A
    whereQueue.push([{ unitId: "unit-a" }]); // homeowner A owns unit-a only
    whereQueue.push([{ id: "unit-a", unitNumber: "A" }]);
    // The assessments query will only query for unit-a assessments
    whereQueue.push([]); // No assessments for unit-a (only unit-b has assessments)
    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowner: unknown;
      assessments: unknown[];
    };
    // Alice should not see Bob's assessments
    expect(body.assessments).toEqual([]);
  });

  it("does not expose assessments for inactive owned units", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", firstName: "Jane", lastName: "Smith" }]);
    whereQueue.push([{ unitId: "inactive-unit" }]);
    whereQueue.push([]);
    whereQueue.push([]);

    const res = await router.fetch(
      new Request("http://localhost/owner/me", {
        headers: { "x-owner-token": "good" },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowner: { unitId: string | null; unitNumber: string | null };
      assessments: unknown[];
    };
    expect(body.homeowner).toMatchObject({
      unitId: null,
      unitNumber: null,
    });
    expect(body.assessments).toEqual([]);
    const assessmentCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(assessmentCondition);
    expect(values).toContain("c1");
    expect(values).not.toContain("inactive-unit");
  });
});

describe("GET /owner/arch-requests", () => {
  it("returns 401 without token", async () => {
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests"),
    );
    expect(res.status).toBe(401);
  });
  it("returns 200 with valid token", async () => {
    mockValidToken();
    whereQueue.push([{ id: "r1", requestType: "Fence", status: "pending" }]); // arch requests
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { archRequests: unknown[] };
    expect(body.archRequests).toBeDefined();
  });
  it("scopes owner arch request history to the token community", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        headers: { "x-owner-token": "good" },
      }),
    );
    expect(res.status).toBe(200);
    const archRequestCondition = mockDb.where.mock.calls[3]?.[0];
    const values = collectSqlParamValues(archRequestCondition);
    expect(values).toEqual(expect.arrayContaining(["h1", "c1"]));
  });
});

describe("POST /owner/dues/pay", () => {
  it("returns 401 without token", async () => {
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("creates a checkout session for the token owner's payable assessment", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        period: "April dues",
        status: "pending",
      },
    ]);
    whereQueue.push([
      { id: "h1", communityId: "c1", stripeCustomerId: "cus_owner" },
    ]);
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.test/session_owner",
      paymentIntentId: null,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_payment_started",
      {
        assessment_id: "a1",
        community_id: "c1",
        method: "card",
        status: "pending",
      },
      "owner:h1",
      undefined,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_checkout_ready",
      {
        assessment_id: "a1",
        checkout_available: true,
        community_id: "c1",
        method: "card",
      },
      "owner:h1",
      undefined,
    );
  });

  it("creates checkout for a unit assessment owned by the token homeowner", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: "unit-1",
        amountCents: 12500,
        period: "May special assessment",
        status: "past_due",
      },
    ]);
    whereQueue.push([{ id: "h1", communityId: "c1" }]);
    whereQueue.push([{ id: "own-1", unitId: "unit-1", homeownerId: "h1" }]);
    whereQueue.push([{ id: "unit-1" }]);
    whereQueue.push([]);

    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay?token=query%20token", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 12500,
          method: "card",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      { APP_URL: "https://owners.example/" },
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.test/session_owner",
      paymentIntentId: null,
    });
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: undefined,
        success_url:
          "https://owners.example/portal?token=query%20token&checkout=success",
        cancel_url:
          "https://owners.example/portal?token=query%20token&checkout=cancelled",
        metadata: expect.objectContaining({
          assessmentId: "a1",
          communityId: "c1",
          homeownerId: "h1",
          source: "owner_portal",
        }),
      }),
      {
        idempotencyKey: "owner-dues:c1:h1:a1:card:12500",
      },
    );
  });

  it("returns 422 when the assessed unit is inactive", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: "unit-1",
        amountCents: 12500,
        period: "May special assessment",
        status: "pending",
      },
    ]);
    whereQueue.push([{ id: "h1", communityId: "c1" }]);
    whereQueue.push([{ id: "own-1", unitId: "unit-1", homeownerId: "h1" }]);
    whereQueue.push([]);

    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 12500,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "Assessed unit is not active in this community",
    });
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the assessment is not in the owner community", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "missing",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the assessment is not payable", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        status: "paid",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 422 when the requested amount does not match", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        period: "April dues",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 5000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the token homeowner record is missing", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        status: "pending",
      },
    ]);
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when the owner does not own the assessed unit", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: "unit-2",
        amountCents: 10000,
        status: "pending",
      },
    ]);
    whereQueue.push([
      { id: "h1", communityId: "c1", stripeCustomerId: "cus_owner" },
    ]);
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns an existing payment intent for duplicate owner card payments", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        status: "pending",
      },
    ]);
    whereQueue.push([
      { id: "h1", communityId: "c1", stripeCustomerId: "cus_owner" },
    ]);
    whereQueue.push([
      { id: "pay-1", stripePaymentIntentId: "pi_existing", method: "card" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      clientSecret: "pi_existing_secret",
      checkoutUrl: null,
      paymentIntentId: "pi_existing",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_payment_started",
      {
        assessment_id: "a1",
        community_id: "c1",
        method: "card",
        reused_pending: true,
        status: "pending",
      },
      "owner:h1",
      undefined,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_checkout_ready",
      {
        assessment_id: "a1",
        checkout_available: false,
        community_id: "c1",
        method: "card",
        reused_pending: true,
      },
      "owner:h1",
      undefined,
    );
  });

  it("scopes the pending-PI reuse lookup to the exact amount and unsettled row", async () => {
    // A homeowner who paid an assessment that was later refunded (flipping it
    // back to pending) must NOT be handed the old, already-settled
    // PaymentIntent's client_secret — they could never complete it. The reuse
    // query must filter on the exact amount AND journalEntryId IS NULL, not
    // just (assessmentId, homeownerId, method).
    mockValidToken("h1", "c1");
    whereQueue.push([
      {
        id: "a1",
        communityId: "c1",
        unitId: null,
        amountCents: 10000,
        status: "pending",
      },
    ]);
    whereQueue.push([
      { id: "h1", communityId: "c1", stripeCustomerId: "cus_owner" },
    ]);
    whereQueue.push([
      { id: "pay-1", stripePaymentIntentId: "pi_existing", method: "card" },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/owner/dues/pay", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: "a1",
          amountCents: 10000,
          method: "card",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );

    expect(res.status).toBe(200);
    const reuseCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(reuseCondition);
    // The exact request amount must be part of the reuse predicate.
    expect(values).toContain(10000);
    expect(values).toEqual(expect.arrayContaining(["a1", "h1", "card", 10000]));
  });
});

describe("POST /owner/arch-requests", () => {
  it("returns 401 without token", async () => {
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 201 when creating arch request with valid token and no unitId", async () => {
    mockValidToken();
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([{ unitId: "unit-1" }]);
    whereQueue.push([{ id: "unit-1", communityId: "c1", active: true }]);
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: "r1",
        communityId: "c1",
        homeownerId: "h1",
        requestType: "Fence",
        description: "6ft fence",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { archRequest: unknown };
    expect(body.archRequest).toBeDefined();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: "unit-1" }),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_arch_request_submitted",
      {
        community_id: "c1",
        has_unit: true,
        request_id: "r1",
        request_type_length: 5,
      },
      "owner:h1",
      undefined,
    );
  });

  it("returns 400 for no-unit arch requests when the token owner has no active ownership", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([]);
    const today = new Date().toISOString().slice(0, 10);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Homeowner does not own an active unit",
    });
    const ownershipCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(ownershipCondition);
    expect(values).toEqual(expect.arrayContaining(["h1", today, today]));
  });

  it("returns 400 for no-unit arch requests when current ownership has no active community unit", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([{ unitId: "unit-1" }]);
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Homeowner does not own an active unit",
    });
    const unitCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(unitCondition);
    expect(values).toEqual(expect.arrayContaining(["unit-1", "c1", true]));
  });

  it("accepts no-unit arch requests when any current ownership has an active community unit", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([{ unitId: "inactive-unit" }, { unitId: "active-unit" }]);
    whereQueue.push([{ id: "active-unit", communityId: "c1", active: true }]);
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: "r1",
        communityId: "c1",
        homeownerId: "h1",
        requestType: "Fence",
        description: "6ft fence",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: "active-unit" }),
    );
    const unitCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(unitCondition);
    expect(values).toEqual(
      expect.arrayContaining(["inactive-unit", "active-unit", "c1", true]),
    );
  });

  it("returns 404 when the token homeowner is no longer active in the community", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Homeowner not found",
    });
    const homeownerCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(homeownerCondition);
    expect(values).toEqual(expect.arrayContaining(["h1", "c1", true]));
  });

  it("returns 201 when creating arch request with unitId that belongs to this community", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    // Unit validation query: unit found in community
    whereQueue.push([{ id: "unit-1", communityId: "c1", active: true }]);
    // Ownership validation query: homeowner owns the submitted unit
    whereQueue.push([{ id: "ownership-1" }]);
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: "r2",
        communityId: "c1",
        homeownerId: "h1",
        unitId: "unit-1",
        requestType: "Deck",
        description: "Add deck",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Deck",
          description: "Add deck",
          unitId: "unit-1",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "owner_portal_arch_request_submitted",
      {
        community_id: "c1",
        has_unit: true,
        request_id: "r2",
        request_type_length: 4,
      },
      "owner:h1",
      undefined,
    );
  });

  it("returns 400 when creating arch request with unitId from a different community (security)", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    // Unit validation query: unit NOT found in community c1 (it's in community c2)
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Pool",
          description: "Add pool",
          unitId: "unit-foreign",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unit not found");
  });

  it("returns 400 when creating arch request for another homeowner's unit", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([{ id: "unit-2", communityId: "c1", active: true }]);
    whereQueue.push([]);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "Replace fence",
          unitId: "unit-2",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Homeowner does not own unit");
  });

  it("checks submitted unit ownership against the current active date window", async () => {
    mockValidToken("h1", "c1");
    whereQueue.push([{ id: "h1", communityId: "c1", active: true }]);
    whereQueue.push([{ id: "unit-1", communityId: "c1", active: true }]);
    whereQueue.push([]);
    const today = new Date().toISOString().slice(0, 10);
    const res = await router.fetch(
      new Request("http://localhost/owner/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: "Fence",
          description: "Replace fence",
          unitId: "unit-1",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": "good",
        },
      }),
    );
    expect(res.status).toBe(400);
    const unitCondition = mockDb.where.mock.calls[4]?.[0];
    expect(collectSqlParamValues(unitCondition)).toEqual(
      expect.arrayContaining(["unit-1", "c1", true]),
    );
    const ownershipCondition = mockDb.where.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(ownershipCondition);
    expect(values).toEqual(
      expect.arrayContaining(["unit-1", "h1", today, today]),
    );
  });
});
