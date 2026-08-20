import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

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

const mockInsert = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
  })),
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureException: vi.fn(),
}));

const { captureException } = await import("../../src/lib/observability.js");
const { insertAuditEvent, createAuditMiddleware } =
  await import("../../src/domain/accounting/auditMiddleware.js");

describe("insertAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a row with correct fields", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const mockDb = { insert: mockInsert } as unknown as Parameters<
      typeof insertAuditEvent
    >[0];

    await insertAuditEvent(mockDb, {
      communityId: "comm-1",
      actorUserId: "user-1",
      action: "create",
      entityType: "account",
      entityId: "acc-1",
      diffJson: { name: "Test" },
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "comm-1",
        actorUserId: "user-1",
        action: "create",
        entityType: "account",
        entityId: "acc-1",
        diffJson: { name: "Test" },
      }),
    );
  });

  it("inserts a row with null actorUserId", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: mockValues });

    const mockDb = { insert: mockInsert } as unknown as Parameters<
      typeof insertAuditEvent
    >[0];

    await insertAuditEvent(mockDb, {
      communityId: "comm-1",
      actorUserId: null,
      action: "delete",
      entityType: "account",
      entityId: "acc-2",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        action: "delete",
      }),
    );
  });

  it("does not throw when db insert fails and captures the exception", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValue(new Error("DB down")),
    });

    const mockDb = { insert: mockInsert } as unknown as Parameters<
      typeof insertAuditEvent
    >[0];

    await expect(
      insertAuditEvent(mockDb, {
        communityId: "comm-1",
        actorUserId: null,
        action: "create",
        entityType: "account",
        entityId: "acc-1",
      }),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: "audit-event-insert" },
        extra: { action: "create", entityType: "account" },
      }),
    );
  });
});

describe("createAuditMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeApp(getDb: Parameters<typeof createAuditMiddleware>[0]) {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/finance/*", createAuditMiddleware(getDb));
    app.post("/finance/accounts", async (c) => {
      return c.json({ id: "acc-new" }, 201);
    });
    app.get("/finance/accounts", async (c) => {
      return c.json({ accounts: [] }, 200);
    });
    app.post("/finance/accounts/fail", async (c) => {
      return c.json({ error: "Bad Request" }, 400);
    });
    app.patch("/finance/accounts/:id", async (c) => {
      return c.json({ ok: true }, 200);
    });
    app.delete("/finance/accounts/:id", async (c) => {
      return c.json({ ok: true }, 200);
    });
    app.post("/finance/journal", async (c) => {
      return c.json({ entryId: "je-1" }, 201);
    });
    app.post("/finance/dues", async (c) => {
      return c.json({ id: "due-1" }, 201);
    });
    app.post("/finance/other", async (c) => {
      return c.json({ id: "x-1" }, 201);
    });
    return app;
  }

  it("fires audit event after POST → 201", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const getDb = vi.fn().mockReturnValue(mockDb);
    const app = makeApp(getDb);

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(201);

    // Give micro-task a chance to complete
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        entityType: "account",
        entityId: "acc-new",
        communityId: "comm-1",
      }),
    );
  });

  it("does NOT fire audit event after GET request", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const getDb = vi.fn().mockReturnValue(mockDb);
    const app = makeApp(getDb);

    const req = new Request(
      "http://localhost/finance/accounts?communityId=comm-1",
      { method: "GET" },
    );

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    await Promise.resolve();

    expect(mockValues).not.toHaveBeenCalled();
  });

  it("does NOT fire audit event after POST → 4xx response", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const getDb = vi.fn().mockReturnValue(mockDb);
    const app = makeApp(getDb);

    const req = new Request("http://localhost/finance/accounts/fail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);
    await Promise.resolve();

    expect(mockValues).not.toHaveBeenCalled();
  });

  it("still returns response when audit insert fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB down")),
    });

    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const getDb = vi.fn().mockReturnValue(mockDb);
    const app = makeApp(getDb);

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(201);

    consoleErrorSpy.mockRestore();
  });

  it("derives entityType 'account' from /finance/accounts URL", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "account" }),
    );
  });

  it("derives entityType 'journalEntry' from /finance/journal URL", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "journalEntry" }),
    );
  });

  it("derives entityType 'assessment' from /finance/dues URL", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/dues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "assessment" }),
    );
  });

  it("skips audit for unrecognized URLs instead of writing unknown entity types", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/other", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).not.toHaveBeenCalled();
  });

  it("derives action 'update' from PATCH method", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update" }),
    );
  });

  it("derives action 'delete' from DELETE method", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/accounts/acc-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete" }),
    );
  });

  it("uses null actorUserId when session is missing", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue(null);

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null }),
    );
  });

  it("extracts communityId from query string when body is not JSON", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/finance/*",
      createAuditMiddleware(vi.fn().mockReturnValue({ insert: mockInsert })),
    );
    app.delete("/finance/accounts/:id", async (c) => {
      return c.json({ ok: true }, 200);
    });

    const req = new Request(
      "http://localhost/finance/accounts/acc-1?communityId=comm-qs",
      { method: "DELETE" },
    );
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: "comm-qs" }),
    );
  });

  it("uses entityId from entryId field in response", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "je-1" }),
    );
  });

  it("uses null actorUserId when getAuth throws", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockRejectedValue(new Error("auth error"));

    const mockDb = { insert: mockInsert };
    const app = makeApp(vi.fn().mockReturnValue(mockDb));

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(201);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null }),
    );
  });

  it("derives action 'update' from PUT method", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };

    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/finance/*",
      createAuditMiddleware(vi.fn().mockReturnValue(mockDb)),
    );
    app.put("/finance/accounts/:id", async (c) => {
      return c.json({ id: "acc-upd" }, 200);
    });

    const req = new Request("http://localhost/finance/accounts/acc-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update" }),
    );
  });

  it("skips audit when communityId is not present anywhere", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/finance/*",
      createAuditMiddleware(vi.fn().mockReturnValue(mockDb)),
    );
    app.post("/finance/accounts", async (c) => {
      return c.json({ id: "acc-new" }, 201);
    });

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "no community id here" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).not.toHaveBeenCalled();
  });

  it("captures communityId from body even when handler also reads the body", async () => {
    // Regression: middleware used to read body AFTER next() which failed when
    // the handler had already consumed the stream. This verifies the fix:
    // body is cloned and read BEFORE next() is called.
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const mockDb = { insert: mockInsert };
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/finance/*",
      createAuditMiddleware(vi.fn().mockReturnValue(mockDb)),
    );
    // Handler reads the body itself (simulating zValidator consuming the stream)
    app.post("/finance/accounts", async (c) => {
      await c.req.json(); // consume the stream
      return c.json({ id: "acc-body-consumed" }, 201);
    });

    const req = new Request("http://localhost/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-body-test" }),
    });
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    // communityId must have been captured (body read before next())
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: "comm-body-test" }),
    );
  });

  it("captures communityId and entityId from nested response bodies for path-id mutations", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/governance/*",
      createAuditMiddleware(vi.fn().mockReturnValue({ insert: mockInsert })),
    );
    app.patch("/governance/arch-requests/:id/review", async (c) => {
      return c.json({
        archRequest: {
          id: c.req.param("id"),
          communityId: "comm-from-response",
          status: "approved",
        },
      });
    });

    const req = new Request(
      "http://localhost/governance/arch-requests/ar-1/review",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    await app.fetch(req, mockEnv);
    await Promise.resolve();

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "comm-from-response",
        entityId: "ar-1",
        entityType: "archRequest",
      }),
    );
  });

  it("classifies supported audited route families without unknown entity types", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/*",
      createAuditMiddleware(vi.fn().mockReturnValue({ insert: mockInsert })),
    );

    const routes = [
      ["/finance/units", "unit"],
      ["/finance/homeowners", "homeowner"],
      ["/finance/assessments", "assessment"],
      ["/finance/dues/pay", "payment"],
      ["/finance/reserves/study", "reserveStudy"],
      ["/finance/reserve-study/import", "reserveStudy"],
      ["/governance/homeowners", "homeowner"],
      ["/governance/violations", "violation"],
      ["/governance/arch-requests", "archRequest"],
      ["/governance/transitions/t-1/acknowledge", "boardTransition"],
      ["/governance/meetings", "meeting"],
      ["/governance/meetings/m-1/motions", "motion"],
      ["/governance/motions/mo-1/resolve", "motion"],
      ["/owner/sessions", "ownerPortalSession"],
      ["/owner/dues/pay", "payment"],
      ["/owner/arch-requests", "archRequest"],
      ["/bank/statements", "bankStatement"],
      ["/bank/reconciliations/r-1/finalize", "reconciliation"],
      ["/close/start", "monthEndClose"],
      ["/portfolio", "portfolio"],
    ] as const;

    for (const [path] of routes) {
      app.post(
        path,
        async () =>
          new Response(
            JSON.stringify({ id: path, communityId: "comm-classify" }),
            { headers: { "Content-Type": "application/json" } },
          ),
      );
    }

    for (const [path] of routes) {
      const req = new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-classify" }),
      });
      await app.fetch(req, mockEnv);
    }
    await Promise.resolve();

    const entityTypes = mockValues.mock.calls.map(
      ([value]) => (value as { entityType: string }).entityType,
    );
    expect(entityTypes).toEqual(routes.map(([, entityType]) => entityType));
    expect(entityTypes).not.toContain("unknown");
  });
});
