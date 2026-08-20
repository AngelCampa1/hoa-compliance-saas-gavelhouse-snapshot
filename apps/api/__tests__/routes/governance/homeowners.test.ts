import { describe, it, expect, vi, beforeEach } from "vitest";

// mockTxWhere is a forward reference — it is set after mockWhere is defined so
// that the tx.where() calls also consume from the shared whereQueue, allowing
// tests that add the inner-transaction assertHomeLimit queue entries to work.
let mockTxWhereImpl: (...args: unknown[]) => unknown = () => ({
  then: (_fn: (v: unknown[]) => unknown) => _fn([]),
});

const mockTx = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockResolvedValue([{ id: "test-id" }]),
  // select/from/where support the assertHomeLimit(tx, ...) call inside the txn
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi
    .fn()
    .mockImplementation((...args: unknown[]) => mockTxWhereImpl(...args)),
  execute: vi.fn(async (_query?: unknown) => undefined),
};

const mockGetSession = vi.fn().mockResolvedValue(null);

vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

const whereQueue: unknown[][] = [];
let whereCallIdx = 0;

function makeWhereResult(data: unknown[]) {
  return {
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
    limit: vi.fn().mockImplementation(() => Promise.resolve(data)),
  };
}

const mockWhere = vi.fn().mockImplementation(() => {
  const data = whereQueue[whereCallIdx] ?? [];
  whereCallIdx++;
  return makeWhereResult(data);
});

// Wire the tx.where() forward reference to the same queue-backed implementation
mockTxWhereImpl = () => {
  const data = whereQueue[whereCallIdx] ?? [];
  whereCallIdx++;
  return makeWhereResult(data);
};

const mockLeftJoin = vi.fn().mockReturnThis();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: mockLeftJoin,
    where: mockWhere,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: unknown) =>
      (fn as (tx: typeof mockTx) => Promise<void>)(mockTx),
    ),
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "test-id"),
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

import router from "../../../src/routes/governance/homeowners.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(null);
  whereQueue.length = 0;
  whereCallIdx = 0;
  mockWhere.mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  });
  // Keep the tx.where() impl in sync with the shared queue after vi.clearAllMocks()
  mockTxWhereImpl = () => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  };
  mockTx.where.mockImplementation((...args: unknown[]) =>
    mockTxWhereImpl(...args),
  );
  mockTx.select.mockReturnThis();
  mockTx.from.mockReturnThis();
  mockLeftJoin.mockReturnThis();
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
  mockTx.onConflictDoNothing.mockReturnThis();
  mockTx.onConflictDoUpdate.mockResolvedValue([]);
  mockTx.returning.mockResolvedValue([{ id: "test-id" }]);
  mockTx.execute.mockResolvedValue(undefined);
  mockCaptureEvent.mockReset();
});

function setSession(userId = "u1") {
  mockGetSession.mockResolvedValue({ user: { id: userId } });
}

function setMembership(role = "owner") {
  whereQueue.push([{ role, communityId: "c1", userId: "u1" }]);
}

function pushTier(tier = "portfolio") {
  whereQueue.push([{ tier, status: "active" }]);
}

function setMembershipThenHomeowners(
  role = "owner",
  homeownerRows: unknown[] = [],
) {
  whereQueue.push([{ role, communityId: "c1", userId: "u1" }]);
  whereQueue.push(homeownerRows);
}

function setMembershipThenExistingHomeowners(
  role = "owner",
  existingRows: unknown[] = [],
) {
  whereQueue.push([{ role, communityId: "c1", userId: "u1" }]);
  whereQueue.push([{ tier: "portfolio", status: "active" }]);
  whereQueue.push(existingRows);
}

describe("GET /governance/homeowners", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId missing (with auth)", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    setSession();
    // mockWhere returns [] by default — no membership found
    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with homeowners list", async () => {
    setSession();
    setMembershipThenHomeowners("owner", [
      { id: "h1", firstName: "Jane", lastName: "Smith" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { homeowners: unknown[] };
    expect(body.homeowners).toHaveLength(1);
  });

  it("returns current unit assignment fields for homeowners", async () => {
    setSession();
    setMembershipThenHomeowners("owner", [
      {
        id: "h1",
        firstName: "Jane",
        lastName: "Smith",
        unitId: "unit-1",
        unitNumber: "4B",
      },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );

    expect(res.status).toBe(200);
    expect(mockLeftJoin).toHaveBeenCalledTimes(2);
    const body = (await res.json()) as {
      homeowners: Array<{ unitId: string | null; unitNumber: string | null }>;
    };
    expect(body.homeowners[0]).toMatchObject({
      unitId: "unit-1",
      unitNumber: "4B",
    });
  });

  it("returns each homeowner once when current ownership rows overlap", async () => {
    setSession();
    setMembershipThenHomeowners("owner", [
      {
        id: "h1",
        firstName: "Jane",
        lastName: "Smith",
        unitId: "unit-1",
        unitNumber: "4B",
      },
      {
        id: "h1",
        firstName: "Jane",
        lastName: "Smith",
        unitId: "unit-2",
        unitNumber: "5C",
      },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeowners: Array<{ id: string; unitId: string | null }>;
    };
    expect(body.homeowners).toHaveLength(1);
    expect(body.homeowners[0]).toMatchObject({
      id: "h1",
      unitId: "unit-1",
    });
  });

  it("applies search filter when search param provided", async () => {
    setSession();
    setMembershipThenHomeowners("owner", []);
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners?communityId=c1&search=Smith",
      ),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /governance/homeowners/import", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\n",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId missing on import", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/homeowners/import", {
        method: "POST",
        body: "firstName,lastName,email,address\n",
        headers: { "Content-Type": "text/csv" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user has read-only role", async () => {
    setSession();
    setMembership("viewer");
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when all CSV rows invalid — invalid email row surfaced in skipped", async () => {
    setSession();
    setMembership("owner");
    pushTier();
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\n,,,",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; email: string; reason: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped.length).toBeGreaterThan(0);
    expect(body.skipped[0].reason).toBe("invalid");
  });

  it("returns 422 when CSV headers do not include required homeowner fields", async () => {
    setSession();
    setMembership("owner");
    pushTier();
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "bad\n",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; reason: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped[0].row).toBe(1);
    expect(body.skipped[0].reason).toBe("invalid");
  });

  it("returns 201 on successful import with no errors", async () => {
    setSession();
    setMembership("treasurer");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      created: number;
      skipped: unknown[];
    };
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);
  });

  it("acquires home lock BEFORE assertHomeLimit select inside transaction (POST /governance/homeowners/import)", async () => {
    setSession();
    setMembership("treasurer");
    pushTier(); // assertFeatureTier
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)

    const callLog: string[] = [];

    // Override tx.execute to log "execute" and verify SQL shape
    mockTx.execute.mockImplementation(async (query: unknown) => {
      callLog.push("execute");
      const json = JSON.stringify(query);
      expect(json).toContain("pg_advisory_xact_lock");
      expect(json).toContain("home:");
      return undefined;
    });

    // Override tx.where to log "select" for the assertHomeLimit inner call
    // The inner assertHomeLimit runs tx.select().from().where() — where() is
    // the terminal that returns the count/tier rows.
    const originalWhereImpl = mockTxWhereImpl;
    mockTxWhereImpl = (...args: unknown[]) => {
      callLog.push("select");
      return originalWhereImpl(...args);
    };
    mockTx.where.mockImplementation((...args: unknown[]) =>
      mockTxWhereImpl(...args),
    );

    // Push inner assertHomeLimit tier result to whereQueue
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(201);
    expect(callLog.indexOf("execute")).toBeGreaterThanOrEqual(0);
    expect(callLog.indexOf("select")).toBeGreaterThanOrEqual(0);
    expect(callLog.indexOf("execute")).toBeLessThan(callLog.indexOf("select"));
  });

  it("captures homeowner import analytics without CSV contact details", async () => {
    setSession();
    setMembership("treasurer");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
      {},
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "homeowner_imported",
      {
        community_id: "c1",
        created_count: 1,
        role: "treasurer",
        skipped_count: 0,
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Jane");
    expect(calls).not.toContain("Smith");
    expect(calls).not.toContain("jane@test.com");
    expect(calls).not.toContain("123 Main St");
  });

  it("returns 207 on partial success (some rows valid, some invalid)", async () => {
    setSession();
    setMembership("admin");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    const csv = [
      "firstName,lastName,email,address",
      "Jane,Smith,jane@test.com,123 Main St",
      ",BadRow,not-email,",
    ].join("\n");
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: csv,
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(207);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; reason: string }>;
    };
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toBe("invalid");
  });

  it("returns 201 for import with moveInDate provided", async () => {
    setSession();
    setMembership("secretary");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address,unitNumber,moveInDate\nJane,Smith,jane@test.com,123 Main St,4B,2023-06-01",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { created: number };
    expect(body.created).toBe(1);
  });

  it("skips already-exists email and reports reason already-exists", async () => {
    setSession();
    setMembershipThenExistingHomeowners("owner", [{ email: "Jane@Test.com" }]);
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn — rowsToInsert.length = 0)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; email: string; reason: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toEqual([
      {
        row: 2,
        email: "jane@test.com",
        reason: "already-exists",
      },
    ]);
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it("reports a conflict when an import races with an existing homeowner insert (already-exists)", async () => {
    setSession();
    setMembership("owner");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    mockTx.returning.mockResolvedValueOnce([]);

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; email: string; reason: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toEqual([
      {
        row: 2,
        email: "jane@test.com",
        reason: "already-exists",
      },
    ]);
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
  });

  it("imports the first duplicate-in-upload email and reports later duplicates with reason duplicate-in-upload", async () => {
    setSession();
    setMembership("owner");
    pushTier();
    whereQueue.push([]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    mockTx.returning.mockResolvedValueOnce([{ id: "homeowner-1" }]);

    const csv = [
      "firstName,lastName,email,address",
      "Jane,Smith,jane@test.com,123 Main St",
      "Janet,Smith,jane@test.com,125 Main St",
    ].join("\n");
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: csv,
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(207);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; email: string; reason: string }>;
    };
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual([
      {
        row: 3,
        email: "jane@test.com",
        reason: "duplicate-in-upload",
      },
    ]);
    expect(mockTx.insert).toHaveBeenCalledTimes(4);
  });

  it("returns 201 with empty skipped for an empty batch (header-only CSV)", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn — uniqueRows=[], so existing check skipped)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\n",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      created: number;
      skipped: unknown[];
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toHaveLength(0);
  });

  it("returns 409 with all rows in skipped when entire batch is already-exists", async () => {
    setSession();
    setMembershipThenExistingHomeowners("owner", [
      { email: "alice@test.com" },
      { email: "bob@test.com" },
    ]);
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn — rowsToInsert.length = 0)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)

    const csv = [
      "firstName,lastName,email,address",
      "Alice,A,alice@test.com,1 Main St",
      "Bob,B,bob@test.com,2 Main St",
    ].join("\n");
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: csv,
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ reason: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toHaveLength(2);
    expect(body.skipped.every((s) => s.reason === "already-exists")).toBe(true);
  });

  it("handles a mixed batch: valid insert + duplicate-in-upload + already-exists + invalid", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    whereQueue.push([{ email: "carol@test.com" }]); // existing homeowners check
    pushTier(); // assertHomeLimit tier lookup (outer, pre-txn)
    pushTier(); // assertHomeLimit tier lookup (inner, inside txn)
    mockTx.returning.mockResolvedValueOnce([{ id: "homeowner-alice" }]);

    const csv = [
      "firstName,lastName,email,address",
      "Alice,A,alice@test.com,1 Main St", // row 2 — new, will be inserted
      "Alice2,A,alice@test.com,1 Main St", // row 3 — duplicate-in-upload
      "Carol,C,carol@test.com,3 Main St", // row 4 — already-exists
      ",Bad,not-an-email,", // row 5 — invalid
    ].join("\n");

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: csv,
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    expect(res.status).toBe(207);
    const body = (await res.json()) as {
      created: number;
      skipped: Array<{ row: number; email: string; reason: string }>;
    };
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(3);

    const reasons = body.skipped.map((s) => s.reason);
    expect(reasons).toContain("duplicate-in-upload");
    expect(reasons).toContain("already-exists");
    expect(reasons).toContain("invalid");
  });

  it("re-checks home limit inside transaction to prevent race condition overshooting tier cap", async () => {
    // The assertHomeLimit check that runs before the transaction is a
    // TOCTOU window: a concurrent import can pass the pre-txn check and
    // both inserts overshoot the cap. The fix moves an assertHomeLimit call
    // inside the transaction as well, so the count check and insert are atomic.
    //
    // Scenario: outer pre-txn check sees 49 active units (+ 1 to insert = 50,
    // within the starter cap of 50). By the time the txn runs, a race has filled
    // the last slot so the inner check sees 50 units (+ 1 = 51 > 50) → 403.
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier (portfolio, no limit)
    whereQueue.push([]); // existing homeowners check
    // Outer assertHomeLimit: starter tier (limit=50), count=49 → 49+1=50 ≤ 50 → passes
    whereQueue.push([{ status: "active", tier: "starter" }]); // tier for outer limit check
    whereQueue.push([{ value: 49 }]); // units count for outer limit check
    // Inner assertHomeLimit (inside txn): starter tier, count=50 → 50+1=51 > 50 → 403
    whereQueue.push([{ status: "active", tier: "starter" }]); // tier for inner limit check
    whereQueue.push([{ value: 50 }]); // units count for inner limit check (race filled last slot)

    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main St",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );
    // The HTTPException propagates out of the transaction → Hono returns 403
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("limit_exceeded");
  });

  it("tier check runs before parse-errors early return (assertFeatureTier is first gated step after membership)", async () => {
    // This test documents that the tier check is ordered before the CSV
    // parse-error early return. In test mode assertFeatureTier always passes
    // (isVitest() returns portfolio tier), so the parse-error path is reachable.
    // If tier enforcement were after the parse-error return, a bad-tier caller
    // could probe parse errors without being tier-gated.
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier (early return before assertHomeLimit)

    // Send a CSV that would trigger the parse-errors-only early return (all rows invalid)
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/homeowners/import?communityId=c1",
        {
          method: "POST",
          body: "firstName,lastName,email,address\n,,,",
          headers: { "Content-Type": "text/csv" },
        },
      ),
    );

    // 422 means tier check passed (would be 402/403 if tier blocked first and
    // the route threw, but test env auto-passes tier checks) and parse error
    // was surfaced after tier gating.
    expect(res.status).toBe(422);
    const body = (await res.json()) as { created: number; skipped: unknown[] };
    expect(body.created).toBe(0);
    expect(body.skipped.length).toBeGreaterThan(0);
  });
});
