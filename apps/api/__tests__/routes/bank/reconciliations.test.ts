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
const mockDelete = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    delete: mockDelete,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

const reconciliationsModule =
  await import("../../../src/routes/bank/reconciliations.js");
const reconciliationsRouter = reconciliationsModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", reconciliationsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleReconciliation = {
  id: "recon-1",
  communityId: "comm-1",
  statementId: "stmt-1",
  status: "open",
  finalizedAt: null,
  finalizedByUserId: null,
};

const sampleStatement = {
  id: "stmt-1",
  communityId: "comm-1",
  accountId: "acc-1",
  statementDate: "2024-01-31",
  beginningBalanceCents: 100000,
  endingBalanceCents: 135000,
  importedAt: new Date().toISOString(),
};

const sampleLines = [
  {
    id: "line-1",
    statementId: "stmt-1",
    communityId: "comm-1",
    postedDate: "2024-01-15",
    description: "ACH Deposit",
    amountCents: 50000,
  },
  {
    id: "line-2",
    statementId: "stmt-1",
    communityId: "comm-1",
    postedDate: "2024-01-16",
    description: "Check #1001",
    amountCents: -15000,
  },
];

const sampleMatches = [
  {
    id: "match-1",
    reconciliationId: "recon-1",
    communityId: "comm-1",
    statementLineId: "line-1",
    paymentId: "pay-1",
    journalLineId: null,
  },
];

describe("bank/reconciliations routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /bank/reconciliations/:id", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 403 when user is not a member", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 404 when reconciliation does not exist", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation not found
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/missing?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(404);
    });

    it("returns 200 with full reconciliation detail", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      // statement
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });

      // lines
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });

      // matches
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleMatches),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        reconciliation: unknown;
        statement: unknown;
        lines: unknown[];
        matches: unknown[];
      };
      expect(body).toHaveProperty("reconciliation");
      expect(body).toHaveProperty("statement");
      expect(body).toHaveProperty("lines");
      expect(body).toHaveProperty("matches");
    });
  });

  describe("POST /bank/reconciliations/:id/matches", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member (POST matches)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 403 when user does not have write role", async () => {
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
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 when body fails Zod validation (no paymentId or journalLineId)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: null,
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when body reconciliationId disagrees with path", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "other-recon",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "reconciliationId must match path",
      });
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 404 when statement line is outside the reconciliation", async () => {
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
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
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "other-line",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Statement line not found" });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 404 when reconciliation is not found for match creation", async () => {
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
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/missing/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "missing",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Reconciliation not found" });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 404 when payment does not belong to the community", async () => {
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleLines[0]]),
          })),
        })),
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
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-other",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Payment not found" });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 404 when journal line does not belong to the community", async () => {
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleLines[0]]),
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
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: null,
            journalLineId: "jl-other",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Journal line not found" });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 201 on successful match creation", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleLines[0]]),
          })),
        })),
      });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "pay-1" }]),
            })),
          })),
        })),
      });

      mockInsert.mockReturnValueOnce({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: "match-new",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-1",
              paymentId: "pay-1",
              journalLineId: null,
            },
          ]),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { match: { id: string } };
      expect(body.match.id).toBe("match-new");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_match_created",
        {
          community_id: "comm-1",
          match_id: "match-new",
          match_target_type: "payment",
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("ACH Deposit");
      expect(calls).not.toContain("Check #1001");
      expect(calls).not.toContain("50000");
    });

    it("returns 201 when matching a journal line", async () => {
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleLines[1]]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: "jl-1" }]),
          })),
        })),
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: "match-journal",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-2",
              paymentId: null,
              journalLineId: "jl-1",
            },
          ]),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-2",
            paymentId: null,
            journalLineId: "jl-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_match_created",
        {
          community_id: "comm-1",
          match_id: "match-journal",
          match_target_type: "journal_line",
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
        "user-1",
        mockEnv,
      );
    });

    it("returns 409 and does not insert when the reconciliation is finalized", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation already finalized — adding a match would diverge the
      // finalized matchedAmount/balance snapshot from live data.
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { ...sampleReconciliation, status: "finalized" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /bank/reconciliations/:id/matches/:matchId", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member (DELETE)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 403 when user does not have write role", async () => {
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
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 when communityId is missing for DELETE", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 200 on successful match deletion", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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
            limit: vi.fn().mockResolvedValue([sampleMatches[0]]),
          })),
        })),
      });

      // parent reconciliation (status open) — deletion allowed
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      mockDelete.mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([]),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_match_deleted",
        {
          community_id: "comm-1",
          match_id: "match-1",
          reconciliation_id: "recon-1",
          role: "treasurer",
        },
        "user-1",
        mockEnv,
      );
    });

    it("returns 404 and does not track when match is not in the path reconciliation", async () => {
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
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/wrong-recon/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "Match not found" });
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "bank_reconciliation_match_deleted",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 409 and does not delete when the reconciliation is finalized", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // match row exists
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleMatches[0]]),
          })),
        })),
      });

      // parent reconciliation is finalized — deleting a match would diverge the
      // finalized snapshot from live data.
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { ...sampleReconciliation, status: "finalized" },
              ]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );

      expect(res.status).toBe(409);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("POST /bank/reconciliations/:id/finalize", () => {
    it("returns 400 when finalize body fails Zod validation", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1" }), // missing reconciliationId
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when finalize body reconciliationId disagrees with path", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "other-recon",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "reconciliationId must match path",
      });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member (finalize)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 403 when user does not have write role", async () => {
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
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 404 when reconciliation is not found during finalize", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation not found
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/missing/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "missing",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
    });

    it("returns 409 when the reconciliation is already finalized (no double-finalize)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation already finalized — finalize must short-circuit here so
      // the original finalizedAt/finalizedByUserId audit record is never
      // overwritten and the finalized event is not re-emitted.
      const alreadyFinalized = {
        ...sampleReconciliation,
        status: "finalized",
        finalizedAt: new Date("2024-02-01T00:00:00.000Z"),
        finalizedByUserId: "user-original",
      };
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([alreadyFinalized]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      // The finalized event must not be re-emitted on a repeat finalize.
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "bank_reconciliation_finalized",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 404 when statement is not found during finalize", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation found
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      // statement not found
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
    });

    it("returns 422 when balance does not check out", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      // statement
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });

      // lines
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });

      // matches (only line-1 matched, line-2 is unmatched)
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([sampleMatches[0]]),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(422);
      const body = (await res.json()) as {
        error: string;
        deltaCents?: number;
      };
      expect(body).toHaveProperty("deltaCents");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_finalize_failed",
        {
          balanced: false,
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 1,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
          unmatched_line_count: 1,
        },
        "user-1",
        mockEnv,
      );
    });

    it("does not count dangling match amounts during finalize validation", async () => {
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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "match-dangling",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "missing-line",
              paymentId: null,
              journalLineId: "jl-1",
            },
          ]),
        })),
      });

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(422);
      await expect(res.json()).resolves.toEqual({
        error: "Reconciliation does not balance",
        deltaCents: -35000,
        unmatchedLines: 2,
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_finalize_failed",
        {
          balanced: false,
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 0,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
          unmatched_line_count: 2,
        },
        "user-1",
        mockEnv,
      );
    });

    it("returns 409 when a concurrent finalize wins the race (update returns no row)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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
      // reconciliation — open at SELECT time, so the JS guard passes
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      // statement
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });
      // lines
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });
      // matches — all matched & balanced, so finalize validation passes
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "match-1",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-1",
              paymentId: "pay-1",
              journalLineId: null,
            },
            {
              id: "match-2",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-2",
              paymentId: null,
              journalLineId: "jl-1",
            },
          ]),
        })),
      });
      // update — the conditional WHERE (status = open) matches zero rows
      // because a concurrent finalize already flipped it; returning() is empty.
      const mockUpdate = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));
      vi.mocked(
        (await import("../../../src/db/client.js")).createDb,
      ).mockReturnValueOnce({
        insert: mockInsert,
        select: mockSelect,
        delete: mockDelete,
        update: mockUpdate,
      } as unknown as ReturnType<
        typeof import("../../../src/db/client.js").createDb
      >);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(409);
      // The finalized events must NOT be emitted for the race loser.
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "bank_reconciliation_finalized",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "reconciliation_completed",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns 200 when reconciliation finalizes successfully", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership
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

      // reconciliation
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });

      // statement: beginningBalance=100000, endingBalance=135000
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });

      // lines — net 35000 (50000 - 15000)
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });

      // matches — all lines matched
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "match-1",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-1",
              paymentId: "pay-1",
              journalLineId: null,
            },
            {
              id: "match-2",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-2",
              paymentId: null,
              journalLineId: "jl-1",
            },
          ]),
        })),
      });

      // update reconciliation — returning() yields the finalized row
      const mockUpdate = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi
              .fn()
              .mockResolvedValue([
                { ...sampleReconciliation, status: "finalized" },
              ]),
          })),
        })),
      }));

      // Need to add update to db mock — re-mock
      vi.mocked(
        (await import("../../../src/db/client.js")).createDb,
      ).mockReturnValueOnce({
        insert: mockInsert,
        select: mockSelect,
        delete: mockDelete,
        update: mockUpdate,
      } as unknown as ReturnType<
        typeof import("../../../src/db/client.js").createDb
      >);

      const res = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        reconciliationId: "recon-1",
        status: "finalized",
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_reconciliation_finalized",
        {
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 2,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
        "user-1",
        mockEnv,
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "reconciliation_completed",
        {
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 2,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
        "user-1",
        mockEnv,
      );
    });

    it("keeps reconciliation responses stable when analytics capture fails", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleLines[0]]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "pay-1" }]),
            })),
          })),
        })),
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: "match-new",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-1",
              paymentId: "pay-1",
              journalLineId: null,
            },
          ]),
        })),
      });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const createMatch = await makeRequest(
        "/bank/reconciliations/recon-1/matches",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
            statementLineId: "line-1",
            paymentId: "pay-1",
            journalLineId: null,
          }),
        },
        mockEnv,
      );
      expect(createMatch.status).toBe(201);

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
            limit: vi.fn().mockResolvedValue([sampleMatches[0]]),
          })),
        })),
      });
      // parent reconciliation (status open) — deletion allowed
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockDelete.mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([]),
      });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const deleteMatch = await makeRequest(
        "/bank/reconciliations/recon-1/matches/match-1?communityId=comm-1",
        { method: "DELETE" },
        mockEnv,
      );
      expect(deleteMatch.status).toBe(200);

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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([sampleMatches[0]]),
        })),
      });
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const failedFinalize = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );
      expect(failedFinalize.status).toBe(422);

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
            limit: vi.fn().mockResolvedValue([sampleReconciliation]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleStatement]),
          })),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(sampleLines),
        })),
      });
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "match-1",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-1",
              paymentId: "pay-1",
              journalLineId: null,
            },
            {
              id: "match-2",
              reconciliationId: "recon-1",
              communityId: "comm-1",
              statementLineId: "line-2",
              paymentId: null,
              journalLineId: "jl-1",
            },
          ]),
        })),
      });

      const mockUpdate = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi
              .fn()
              .mockResolvedValue([
                { ...sampleReconciliation, status: "finalized" },
              ]),
          })),
        })),
      }));
      vi.mocked(
        (await import("../../../src/db/client.js")).createDb,
      ).mockReturnValueOnce({
        insert: mockInsert,
        select: mockSelect,
        delete: mockDelete,
        update: mockUpdate,
      } as unknown as ReturnType<
        typeof import("../../../src/db/client.js").createDb
      >);
      mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

      const successfulFinalize = await makeRequest(
        "/bank/reconciliations/recon-1/finalize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            communityId: "comm-1",
            reconciliationId: "recon-1",
          }),
        },
        mockEnv,
      );
      expect(successfulFinalize.status).toBe(200);
    });
  });
});
