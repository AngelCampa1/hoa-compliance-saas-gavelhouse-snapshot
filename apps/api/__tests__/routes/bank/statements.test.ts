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
const mockCaptureEvent = vi.fn().mockResolvedValue(undefined);

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
const mockTransaction = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    transaction: mockTransaction,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const statementsModule = await import("../../../src/routes/bank/statements.js");
const statementsRouter = statementsModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", statementsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const validCsv = [
  "posted_date,description,amount",
  "2024-01-15,ACH Deposit,500.00",
  "2024-01-16,Check #1001,-250.00",
].join("\n");

const validImportBody = {
  communityId: "comm-1",
  accountId: "acc-1",
  beginningBalanceCents: 100000,
  endingBalanceCents: 135000,
  statementDate: "2024-01-31",
  csv: validCsv,
};

describe("bank/statements routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockResolvedValue(undefined);
  });

  describe("POST /bank/statements", () => {
    it("returns 413 with payload_too_large when content-length header exceeds MAX_CSV_BYTES", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const tenMbPlusOne = 10 * 1024 * 1024 + 1;
      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "content-length": String(tenMbPlusOne),
          },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("payload_too_large");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          failure_type: "payload_too_large",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("does not reject when content-length is exactly MAX_CSV_BYTES", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const exactLimit = 10 * 1024 * 1024;
      // This is just checking the header guard; the actual body is small so
      // the validator will still run (and the request can proceed past the guard).
      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "content-length": String(exactLimit),
          },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      // Status should NOT be 413 from the content-length guard
      expect(res.status).not.toBe(413);
    });

    it("does not reject when content-length header is absent", async () => {
      // No content-length — guard must skip entirely and let body validation proceed.
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      // Must not 413 from the content-length guard
      expect(res.status).not.toBe(413);
    });

    it("returns 415 when content-type is not application/json", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "some plain text",
        },
        mockEnv,
      );

      expect(res.status).toBe(415);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("application/json");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          failure_type: "invalid_content_type",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 415 when content-type header is absent", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          // No Content-Type header — exercises the ?? "" fallback branch
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(415);
    });

    it("returns 413 when CSV content exceeds 10MB", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // Generate a CSV string that exceeds 10MB (10 * 1024 * 1024 bytes)
      const tenMbPlus = "a".repeat(10 * 1024 * 1024 + 1);
      const bigBody = {
        ...validImportBody,
        csv: tenMbPlus,
      };

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bigBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("10 MB");
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          failure_type: "csv_too_large",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.not.objectContaining({
          account_id: expect.any(String),
          community_id: expect.any(String),
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
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
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          failure_type: "not_member",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.not.objectContaining({
          account_id: expect.any(String),
          community_id: expect.any(String),
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 403 when user has viewer role", async () => {
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
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          account_id: "acc-1",
          community_id: "comm-1",
          failure_type: "role_forbidden",
          role: "viewer",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 422 when CSV has invalid headers", async () => {
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

      const badBody = {
        ...validImportBody,
        csv: "date,desc,amt\n2024-01-01,Foo,100.00",
      };

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "acc-1", communityId: "comm-1" }]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(badBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/header/i);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          account_id: "acc-1",
          community_id: "comm-1",
          failure_type: "parse_error",
          role: "treasurer",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 404 when account does not belong to community", async () => {
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
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Account not found" });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          account_id: "acc-1",
          community_id: "comm-1",
          failure_type: "account_not_found",
          role: "treasurer",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 400 when body fails Zod validation", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "comm-1" }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_upload_failed",
        expect.objectContaining({
          failure_type: "invalid_body",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 201 for CSV with zero lines (headers only)", async () => {
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
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "acc-1", communityId: "comm-1" }]),
          })),
        })),
      });

      mockTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            insert: vi.fn(() => ({
              values: vi.fn().mockResolvedValue([]),
            })),
          };
          return fn(mockTx);
        },
      );

      const emptyBody = {
        ...validImportBody,
        csv: "posted_date,description,amount\n",
        beginningBalanceCents: 100000,
        endingBalanceCents: 100000,
      };

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(emptyBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { lineCount: number };
      expect(body.lineCount).toBe(0);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_uploaded",
        expect.objectContaining({
          account_id: "acc-1",
          community_id: "comm-1",
          line_count: 0,
          reconciliation_id: "generated-id",
          role: "treasurer",
          statement_id: "generated-id",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
    });

    it("returns 201 on successful import", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership check
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

      // transaction mock — runs the callback
      mockTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            insert: vi.fn(() => ({
              values: vi.fn().mockResolvedValue([]),
            })),
          };
          return fn(mockTx);
        },
      );

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "acc-1", communityId: "comm-1" }]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        statementId: string;
        reconciliationId: string;
        lineCount: number;
      };
      expect(body).toHaveProperty("statementId");
      expect(body).toHaveProperty("reconciliationId");
      expect(body.lineCount).toBe(2);
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "bank_statement_uploaded",
        expect.objectContaining({
          account_id: "acc-1",
          community_id: "comm-1",
          line_count: 2,
          reconciliation_id: "generated-id",
          role: "treasurer",
          statement_id: "generated-id",
          statement_month: "2024-01",
        }),
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(mockCaptureEvent.mock.calls);
      expect(calls).not.toContain("ACH Deposit");
      expect(calls).not.toContain("Check #1001");
      expect(calls).not.toContain("100000");
      expect(calls).not.toContain("135000");
    });

    it("POST /bank/statements (REST path) returns 201 — confirms route is at correct path, not /import", async () => {
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

      mockTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<void>) => {
          const mockTx = {
            insert: vi.fn(() => ({
              values: vi.fn().mockResolvedValue([]),
            })),
          };
          return fn(mockTx);
        },
      );

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "acc-1", communityId: "comm-1" }]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validImportBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
    });
  });

  describe("GET /bank/statements", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/bank/statements?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/bank/statements",
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
        "/bank/statements?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 200 with list of statements including reconciliationId", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership check
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

      // statements list
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "stmt-1",
                communityId: "comm-1",
                statementDate: "2024-01-31",
                beginningBalanceCents: 100000,
                endingBalanceCents: 135000,
              },
            ]),
          })),
        })),
      });

      // reconciliations lookup by statementId
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "rec-1", statementId: "stmt-1" }]),
        })),
      });

      const res = await makeRequest(
        "/bank/statements?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        statements: { id: string; reconciliationId: string | null }[];
      };
      expect(Array.isArray(body.statements)).toBe(true);
      expect(body.statements[0]?.reconciliationId).toBe("rec-1");
    });

    it("returns 200 with empty list when no statements exist (skips reconciliation lookup)", async () => {
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

      // statements list — empty
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/bank/statements?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { statements: unknown[] };
      expect(body.statements).toHaveLength(0);
    });

    it("returns reconciliationId null when no reconciliation exists for a statement", async () => {
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

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "stmt-1",
                communityId: "comm-1",
                statementDate: "2024-01-31",
                beginningBalanceCents: 100000,
                endingBalanceCents: 135000,
              },
            ]),
          })),
        })),
      });

      // no reconciliation found for this statement
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      });

      const res = await makeRequest(
        "/bank/statements?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        statements: { id: string; reconciliationId: string | null }[];
      };
      expect(body.statements[0]?.reconciliationId).toBeNull();
    });
  });
});
