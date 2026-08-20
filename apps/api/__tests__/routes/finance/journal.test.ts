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
  captureEvent: vi.fn(),
  captureException: vi.fn(() => "event-api-123"),
  buildInternalErrorBody: vi.fn((trackingId?: string) => ({
    error: "Something went wrong. Please try again.",
    ...(trackingId ? { trackingId } : {}),
  })),
}));

// Mock postEntry domain service
const mockPostEntry = vi.fn();
vi.mock("../../../src/domain/accounting/postEntry.js", () => ({
  postEntry: mockPostEntry,
  CommingleError: class CommingleError extends Error {
    name = "CommingleError";
  },
}));

const financeJournalModule =
  await import("../../../src/routes/finance/journal.js");
const financeJournalRouter = financeJournalModule.default;
const { captureEvent, captureException } =
  await import("../../../src/lib/observability.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", financeJournalRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const validPostBody = {
  communityId: "comm-1",
  entryDate: "2024-01-15",
  memo: "Test entry",
  lines: [
    { accountId: "acc-1", debitCents: 1000, creditCents: 0 },
    { accountId: "acc-2", debitCents: 0, creditCents: 1000 },
  ],
};

// Sample entry returned from DB
const sampleEntry = {
  id: "entry-1",
  communityId: "comm-1",
  entryDate: "2024-01-15",
  memo: "Test entry",
  createdByUserId: "user-1",
  postedAt: new Date().toISOString(),
  reversedByEntryId: null,
};

const sampleLines = [
  {
    id: "line-1",
    entryId: "entry-1",
    accountId: "acc-1",
    debitCents: 1000,
    creditCents: 0,
    fundType: "operating",
    accountName: "Operating Checking",
    accountCode: "1000",
  },
  {
    id: "line-2",
    entryId: "entry-1",
    accountId: "acc-2",
    debitCents: 0,
    creditCents: 1000,
    fundType: "operating",
    accountName: "Assessment Revenue",
    accountCode: "4000",
  },
];

describe("finance/journal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /finance/journal", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 403 for viewer role", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // membership check — viewer role
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
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
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
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 when body fails Zod validation (single line)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      // No mockSelect needed — Zod validation fails before the membership check

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...validPostBody,
            lines: [{ accountId: "acc-1", debitCents: 1000, creditCents: 0 }],
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when missing communityId", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryDate: "2024-01-15",
            memo: "Test",
            lines: [
              { accountId: "acc-1", debitCents: 1000, creditCents: 0 },
              { accountId: "acc-2", debitCents: 0, creditCents: 1000 },
            ],
          }),
        },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 422 on CommingleError with message", async () => {
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

      const { CommingleError: CE } =
        await import("../../../src/domain/accounting/postEntry.js");
      const commingleErr = new CE(
        "Operating and reserve funds must balance independently.",
      );
      mockPostEntry.mockRejectedValueOnce(commingleErr);

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Operating and reserve funds");
    });

    it("returns 201 on valid entry", async () => {
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

      mockPostEntry.mockResolvedValueOnce({
        entryId: "entry-1",
        lineCount: 2,
      });

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { entryId: string; lineCount: number };
      expect(body.entryId).toBe("entry-1");
      expect(body.lineCount).toBe(2);
    });

    it("captures journal posting analytics without memo or line details", async () => {
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

      mockPostEntry.mockResolvedValueOnce({
        entryId: "entry-1",
        lineCount: 2,
      });

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(captureEvent).toHaveBeenCalledWith(
        "journal_entry_posted",
        {
          community_id: "comm-1",
          entry_id: "entry-1",
          entry_month: "2024-01",
          line_count: 2,
          role: "treasurer",
        },
        "user-1",
        mockEnv,
      );
      const calls = JSON.stringify(vi.mocked(captureEvent).mock.calls);
      expect(calls).not.toContain("Test entry");
      expect(calls).not.toContain("acc-1");
      expect(calls).not.toContain("acc-2");
    });

    it("returns 500 and captures exception when postEntry throws a generic Error (infra/DB errors must not leak as 400)", async () => {
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

      mockPostEntry.mockRejectedValueOnce(
        new Error(
          'duplicate key value violates unique constraint "journal_entries_pkey"',
        ),
      );

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; trackingId?: string };
      expect(body.error).toBe("Something went wrong. Please try again.");
      expect(captureException).toHaveBeenCalled();
    });

    it("captures and returns tracking ID when postEntry throws a non-Error value", async () => {
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

      // postEntry rejects with a non-Error value (plain object)
      const nonError = { code: "UNEXPECTED", detail: "something went wrong" };
      mockPostEntry.mockImplementationOnce(() => Promise.reject(nonError));

      const res = await makeRequest(
        "/finance/journal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPostBody),
        },
        mockEnv,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        error: "Something went wrong. Please try again.",
        trackingId: "event-api-123",
      });
      expect(captureException).toHaveBeenCalledWith(
        nonError,
        expect.objectContaining({
          tags: { source: "finance-journal-create" },
          extra: { communityId: "comm-1" },
        }),
      );
    });
  });

  describe("GET /finance/journal", () => {
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
        `/finance/journal?communityId=comm-1&${query}`,
        { method: "GET" },
        mockEnv,
      );
    }

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/journal",
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
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });

    it("returns 200 with paginated entries and lines", async () => {
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

      // entries query
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue([sampleEntry]),
              })),
            })),
          })),
        })),
      });

      // lines query for the entry
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(sampleLines),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        entries: unknown[];
        total: number;
        limit: number;
        offset: number;
      };
      expect(body).toHaveProperty("entries");
      expect(Array.isArray(body.entries)).toBe(true);
    });

    it("issues exactly one batch lines query for multiple entries (N+1 fix)", async () => {
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

      const entry1 = { ...sampleEntry, id: "entry-1" };
      const entry2 = {
        ...sampleEntry,
        id: "entry-2",
        memo: "Second entry",
        entryDate: "2024-01-16",
      };

      // entries query returns two entries
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue([entry1, entry2]),
              })),
            })),
          })),
        })),
      });

      // ONE batch lines query covering both entries
      const linesForEntry1 = sampleLines.map((l) => ({
        ...l,
        entryId: "entry-1",
      }));
      const linesForEntry2 = [
        {
          id: "line-3",
          entryId: "entry-2",
          accountId: "acc-1",
          debitCents: 500,
          creditCents: 0,
          fundType: "reserve",
          accountName: "Reserve Checking",
          accountCode: "1500",
        },
      ];
      let batchQueryCallCount = 0;
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => {
              batchQueryCallCount++;
              return Promise.resolve([...linesForEntry1, ...linesForEntry2]);
            }),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        entries: Array<{ id: string; lines: unknown[] }>;
      };
      expect(body.entries).toHaveLength(2);
      // Verify lines are correctly grouped per entry
      expect(body.entries[0].lines).toHaveLength(2);
      expect(body.entries[1].lines).toHaveLength(1);
      // Exactly one batch query was issued (not one per entry)
      expect(batchQueryCallCount).toBe(1);
    });

    it("returns empty lines array for entries with no lines", async () => {
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

      // entries query returns one entry
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue([sampleEntry]),
              })),
            })),
          })),
        })),
      });

      // Batch lines query returns empty (no lines for this entry)
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        entries: Array<{ id: string; lines: unknown[] }>;
      };
      expect(body.entries[0].lines).toHaveLength(0);
    });

    it("skips the lines query and returns empty arrays when page has no entries", async () => {
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

      // entries query returns empty
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

      // No third mock needed — the batch query should be skipped entirely.

      const res = await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        entries: unknown[];
      };
      expect(body.entries).toHaveLength(0);
      // Only 2 select calls: membership + entries (no lines query)
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("applies default limit 50", async () => {
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

      let capturedLimit = 0;
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn((n: number) => {
                capturedLimit = n;
                return {
                  offset: vi.fn().mockResolvedValue([]),
                };
              }),
            })),
          })),
        })),
      });

      await makeRequest(
        "/finance/journal?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(capturedLimit).toBe(50);
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

  describe("GET /finance/journal/:entryId", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const res = await makeRequest(
        "/finance/journal/entry-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns 400 when communityId is missing", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      const res = await makeRequest(
        "/finance/journal/entry-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(400);
    });

    it("returns 200 for an existing entry in the community", async () => {
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

      // entry fetch
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([sampleEntry]),
          })),
        })),
      });

      // lines fetch
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(sampleLines),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal/entry-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { entry: unknown; lines: unknown[] };
      expect(body).toHaveProperty("entry");
      expect(body).toHaveProperty("lines");
    });

    it("returns 404 when entry does not exist or belongs to a different community", async () => {
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

      // entry fetch returns empty (wrong community or missing)
      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal/nonexistent?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "Entry not found" });
    });

    it("returns 403 when user is not a member (single entry)", async () => {
      mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

      mockSelect.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      });

      const res = await makeRequest(
        "/finance/journal/entry-1?communityId=comm-1",
        { method: "GET" },
        mockEnv,
      );

      expect(res.status).toBe(403);
    });
  });
});
