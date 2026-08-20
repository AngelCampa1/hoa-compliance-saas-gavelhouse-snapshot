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
};

const mockGetSession = vi.fn();
const mockCaptureEvent = vi.fn().mockResolvedValue(undefined);

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

const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: mockDbSelect,
    update: mockDbUpdate,
  })),
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const activationModule = await import("../../src/routes/activation.js");
const activationRouter = activationModule.default;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", activationRouter);
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

/** Returns a mock select chain that resolves to the given rows */
function mockSelectReturning(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

describe("activation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    });
  });

  describe("auth middleware", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await makeRequest(
        "/activation?communityId=c1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("GET /activation", () => {
    it("returns 400 when communityId is missing", async () => {
      const res = await makeRequest("/activation", { method: "GET" }, mockEnv);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "communityId required" });
    });

    it("returns 403 when caller is not a member of the community", async () => {
      // membership check returns empty
      mockDbSelect.mockReturnValueOnce(mockSelectReturning([]));

      const res = await makeRequest(
        "/activation?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 404 when community activation not found", async () => {
      // membership check succeeds
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      // activation row not found
      mockDbSelect.mockReturnValueOnce(mockSelectReturning([]));

      const res = await makeRequest(
        "/activation?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(404);
    });

    it("returns 200 with activation data when found", async () => {
      const mockRow = {
        id: "act-1",
        communityId: "comm-1",
        rosterImported: false,
        reservePopulated: false,
        complianceAcknowledged: false,
        dueBatchConfigured: false,
      };
      // membership check succeeds
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      // activation row found
      mockDbSelect.mockReturnValueOnce(mockSelectReturning([mockRow]));

      const res = await makeRequest(
        "/activation?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ activation: mockRow });
    });
  });

  describe("PATCH /activation/:step", () => {
    it("returns 400 for invalid step", async () => {
      const res = await makeRequest(
        "/activation/invalid_step",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "Invalid step" });
    });

    it("returns 422 when body is invalid", async () => {
      const res = await makeRequest(
        "/activation/roster_imported",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "", completed: "not-bool" }),
        },
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 403 when caller is not a member of the community", async () => {
      // membership check returns empty
      mockDbSelect.mockReturnValueOnce(mockSelectReturning([]));

      const res = await makeRequest(
        "/activation/roster_imported",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 403 when caller is a member with a viewer/read-only role", async () => {
      // membership found but role is not admin/owner
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "viewer" },
        ]),
      );

      const res = await makeRequest(
        "/activation/roster_imported",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    it("returns 200 for valid step (roster_imported)", async () => {
      // membership check succeeds
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          {
            communityId: "comm-1",
            rosterImported: false,
            reservePopulated: false,
            complianceAcknowledged: false,
            dueBatchConfigured: false,
          },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/roster_imported",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ rosterImported: true }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "activation_step_completed",
        expect.objectContaining({
          step: "roster_imported",
          community_id: "comm-1",
          role: "owner",
          completed_count: 1,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "aha_reached",
        expect.objectContaining({
          community_id: "comm-1",
          first_completed_step: "roster_imported",
          completed_count: 1,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
    });

    it("tracks the first completed activation step when no activation snapshot exists", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(mockSelectReturning([]));
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/roster_imported",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "activation_step_completed",
        expect.objectContaining({
          step: "roster_imported",
          completed_count: 1,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "aha_reached",
        expect.objectContaining({
          first_completed_step: "roster_imported",
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
    });

    it("returns 200 for valid step (reserve_populated)", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/reserve_populated",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: false }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          reservePopulated: false,
          reservePopulatedAt: null,
        }),
      );
    });

    it("returns 200 for compliance_acknowledged step", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          {
            communityId: "comm-1",
            rosterImported: true,
            reservePopulated: true,
            complianceAcknowledged: false,
            dueBatchConfigured: false,
          },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/compliance_acknowledged",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ complianceAcknowledged: true }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "activation_step_completed",
        expect.objectContaining({
          step: "compliance_acknowledged",
          completed_count: 3,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "aha_reached",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 200 for reserve_populated step with completed=true", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          {
            communityId: "comm-1",
            rosterImported: true,
            reservePopulated: false,
            complianceAcknowledged: false,
            dueBatchConfigured: false,
          },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/reserve_populated",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          reservePopulated: true,
          reservePopulatedAt: expect.any(Date),
        }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "activation_step_completed",
        expect.objectContaining({
          step: "reserve_populated",
          completed_count: 2,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
    });

    it("returns 200 for compliance_acknowledged step with completed=false", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/compliance_acknowledged",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: false }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          complianceAcknowledged: false,
          complianceAcknowledgedAt: null,
        }),
      );
    });

    it("returns 200 for dues_batch_configured step", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          {
            communityId: "comm-1",
            rosterImported: true,
            reservePopulated: true,
            complianceAcknowledged: true,
            dueBatchConfigured: false,
          },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/dues_batch_configured",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ dueBatchConfigured: true }),
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "activation_completed",
        expect.objectContaining({
          community_id: "comm-1",
          completed_count: 4,
          total_count: 4,
        }),
        "user-1",
        mockEnv,
        { uuid: expect.stringMatching(uuidPattern) },
      );
    });

    it("does not duplicate activation_completed when a completed community repeats a completed step", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          {
            communityId: "comm-1",
            rosterImported: true,
            reservePopulated: true,
            complianceAcknowledged: true,
            dueBatchConfigured: true,
          },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/dues_batch_configured",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "activation_step_completed",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "activation_completed",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 200 for dues_batch_configured step with completed=false", async () => {
      mockDbSelect.mockReturnValueOnce(
        mockSelectReturning([
          { communityId: "comm-1", userId: "user-1", role: "owner" },
        ]),
      );
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn(() => ({ where: mockWhere }));
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      const res = await makeRequest(
        "/activation/dues_batch_configured",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1", completed: false }),
        },
        mockEnv,
      );
      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          dueBatchConfigured: false,
          dueBatchConfiguredAt: null,
        }),
      );
    });
  });
});
