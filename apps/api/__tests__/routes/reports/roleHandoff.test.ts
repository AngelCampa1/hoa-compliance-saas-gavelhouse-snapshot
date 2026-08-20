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

const mockBuildRoleHandoffReport = vi.fn();
const mockInsertAuditEvent = vi.fn();

vi.mock("../../../src/domain/reporting/roleHandoff.js", () => ({
  buildRoleHandoffReport: mockBuildRoleHandoffReport,
}));

vi.mock("../../../src/domain/accounting/auditMiddleware.js", () => ({
  insertAuditEvent: mockInsertAuditEvent,
}));

const { default: roleHandoffRouter } =
  await import("../../../src/routes/reports/roleHandoff.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", roleHandoffRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

function mockMembership(role: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi
          .fn()
          .mockResolvedValue([{ communityId: "comm-1", userId: "user-1", role }]),
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

function mockTier(stripePriceId: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ stripePriceId }]),
      })),
    })),
  });
}

const roleHandoffPath ="/reports/role-handoff?communityId=comm-1&transitionId=trans-1";

describe("GET /reports/role-handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when transitionId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/reports/role-handoff?communityId=comm-1",
      { method: "GET" },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid query parameters");
  });

  it("returns 403 when user is not a community member before tier lookup", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when community tier is below Scale after membership passes", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockTier("price_starter");

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upgrade_required");
  });

  it("returns 403 for secretary members before building role handoff", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("secretary");

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockBuildRoleHandoffReport).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("returns application/pdf content with expected filename on happy path", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockTier("price_scale");
    mockBuildRoleHandoffReport.mockResolvedValueOnce(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("trans-1");
    expect(mockBuildRoleHandoffReport).toHaveBeenCalledWith(
      expect.anything(),
      "comm-1",
      "trans-1",
    );
    expect(mockInsertAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        communityId: "comm-1",
        actorUserId: "user-1",
        entityType: "report_export",
        entityId: "role-handoff-trans-1",
      }),
    );
  });

  it("returns 422 when the transition role cannot generate a handoff report", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockTier("price_scale");
    mockBuildRoleHandoffReport.mockRejectedValueOnce(
      new Error(
        "Role handoff reports are supported only for treasurer and secretary roles.",
      ),
    );

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "Role handoff reports are supported only for treasurer and secretary roles.",
    });
  });

  it("preserves 500 handling for unexpected report generation failures", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembership("treasurer");
    mockTier("price_scale");
    mockBuildRoleHandoffReport.mockRejectedValueOnce(
      new Error("pdf renderer unavailable"),
    );

    const res = await makeRequest(roleHandoffPath, { method: "GET" }, mockEnv);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "pdf renderer unavailable" });
  });
});
