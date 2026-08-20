import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn().mockResolvedValue(null);

vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

// Queue-based mockWhere: each entry in whereQueue is consumed in call order.
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

// mockOnConflictDoUpdate is called by the communityActivation insert
const mockOnConflictDoUpdate = vi.fn().mockResolvedValue([]);

// We need per-call control of tx.insert() chains.
// Call order (with unitNumber): homeowners(0), units(1), unitOwnerships(2), communityActivation(3)
// Call order (without unitNumber): homeowners(0), communityActivation(1)

let insertCallCount = 0;

// These are reset in beforeEach so individual tests can override them
let homeownerReturningResult: Record<string, unknown>[] = [];
let unitReturningResult: Record<string, unknown>[] = [];

const DEFAULT_INSERTED_HOMEOWNER = {
  id: "h-new",
  firstName: "Alice",
  lastName: "Walker",
  email: "alice@example.com",
  phone: "555-0100",
  moveInDate: "2024-01-01",
};

const DEFAULT_INSERTED_UNIT = { unitNumber: "4B" };

function buildTxInsert() {
  return vi.fn(() => {
    const callIndex = insertCallCount++;
    return {
      values: vi.fn((_vals: unknown) => {
        if (callIndex === 0) {
          // homeowners insert — caller uses .returning()
          return {
            returning: vi.fn().mockResolvedValue(homeownerReturningResult),
          };
        }
        if (callIndex === 1) {
          // units insert (with-unitNumber path) OR communityActivation (without-unitNumber path)
          // Both are handled: units insert uses .returning(), activation uses .onConflictDoUpdate()
          return {
            returning: vi.fn().mockResolvedValue(unitReturningResult),
            onConflictDoUpdate: mockOnConflictDoUpdate,
          };
        }
        // callIndex 2 = unitOwnerships (no returning needed), callIndex 3 = communityActivation
        return {
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoUpdate: mockOnConflictDoUpdate,
        };
      }),
    };
  });
}

// mockTransaction is a module-level reference so tests can override it per case
const mockTransaction = vi.fn(async (fn: unknown) =>
  (
    fn as (tx: {
      insert: ReturnType<typeof buildTxInsert>;
      execute: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    }) => Promise<unknown>
  )({
    insert: buildTxInsert(),
    execute: vi.fn(async () => undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      const data = whereQueue[whereCallIdx] ?? [];
      whereCallIdx++;
      return makeWhereResult(data);
    }),
  }),
);

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: mockWhere,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([DEFAULT_INSERTED_HOMEOWNER]),
    transaction: mockTransaction,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

import router from "../../../src/routes/governance/homeowners.js";

beforeEach(() => {
  vi.clearAllMocks();
  insertCallCount = 0;
  homeownerReturningResult = [{ ...DEFAULT_INSERTED_HOMEOWNER }];
  unitReturningResult = [{ ...DEFAULT_INSERTED_UNIT }];
  mockGetSession.mockResolvedValue(null);
  whereQueue.length = 0;
  whereCallIdx = 0;
  mockWhere.mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  });
  mockOnConflictDoUpdate.mockResolvedValue([]);
  // Reset transaction to the default (pass-through) implementation
  mockTransaction.mockImplementation(async (fn: unknown) => {
    insertCallCount = 0;
    const txInsert = buildTxInsert();
    const txWhere = vi.fn().mockImplementation(() => {
      const data = whereQueue[whereCallIdx] ?? [];
      whereCallIdx++;
      return makeWhereResult(data);
    });
    return (
      fn as (tx: {
        insert: typeof txInsert;
        execute: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
      }) => Promise<unknown>
    )({
      insert: txInsert,
      execute: vi.fn(async () => undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: txWhere,
    });
  });
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

const VALID_BODY = {
  firstName: "Alice",
  lastName: "Walker",
  email: "alice@example.com",
  unitNumber: "4B",
  phone: "555-0100",
  moveInDate: "2024-01-01",
};

function postSingleAdd(
  communityId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return router.fetch(
    new Request(`http://localhost/communities/${communityId}/homeowners`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

describe("POST /communities/:id/homeowners", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member of the community", async () => {
    setSession();
    // whereQueue is empty — no membership found
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(403);
  });

  it("returns 403 when user has a read-only role (viewer)", async () => {
    setSession();
    setMembership("viewer");
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(403);
  });

  it("returns 400 when firstName is empty string", async () => {
    setSession();
    setMembership("owner");
    const body = { ...VALID_BODY, firstName: "" };
    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when lastName is empty string", async () => {
    setSession();
    setMembership("owner");
    const body = { ...VALID_BODY, lastName: "" };
    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is invalid", async () => {
    setSession();
    setMembership("owner");
    const body = { ...VALID_BODY, email: "not-an-email" };
    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when moveInDate is not YYYY-MM-DD format", async () => {
    setSession();
    setMembership("owner");
    const body = { ...VALID_BODY, moveInDate: "01/01/2024" };
    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email field is missing entirely", async () => {
    setSession();
    setMembership("owner");
    const { email: _email, ...bodyWithoutEmail } = VALID_BODY;
    const res = await postSingleAdd("c1", bodyWithoutEmail);
    expect(res.status).toBe(400);
  });

  it("returns 201 with homeowner on successful insert (all fields), inserts units and unitOwnerships rows", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (unitNumber provided)

    // Track what values were passed to each insert so we can assert them
    const capturedInsertValues: Record<string, unknown>[] = [];
    mockTransaction.mockImplementationOnce(async (fn: unknown) => {
      insertCallCount = 0;
      const txInsert = vi.fn(() => {
        const callIndex = insertCallCount++;
        return {
          values: vi.fn((vals: unknown) => {
            capturedInsertValues[callIndex] = vals as Record<string, unknown>;
            if (callIndex === 0) {
              return {
                returning: vi
                  .fn()
                  .mockResolvedValue([{ ...DEFAULT_INSERTED_HOMEOWNER }]),
              };
            }
            if (callIndex === 1) {
              return {
                returning: vi
                  .fn()
                  .mockResolvedValue([{ ...DEFAULT_INSERTED_UNIT }]),
                onConflictDoUpdate: mockOnConflictDoUpdate,
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([]),
              onConflictDoUpdate: mockOnConflictDoUpdate,
            };
          }),
        };
      });
      return (
        fn as (tx: {
          insert: typeof txInsert;
          execute: ReturnType<typeof vi.fn>;
          select: ReturnType<typeof vi.fn>;
          from: ReturnType<typeof vi.fn>;
          where: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>
      )({
        insert: txInsert,
        execute: vi.fn(async () => undefined),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          const data = whereQueue[whereCallIdx] ?? [];
          whereCallIdx++;
          return makeWhereResult(data);
        }),
      });
    });

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { homeowner: Record<string, unknown> };

    // unitNumber must come from the inserted units row, not echoed from input
    expect(body.homeowner).toMatchObject({
      id: "h-new",
      firstName: "Alice",
      lastName: "Walker",
      email: "alice@example.com",
      unitNumber: "4B",
    });

    // 4 inserts: homeowners, units, unitOwnerships, communityActivation
    expect(capturedInsertValues).toHaveLength(4);

    // units insert (callIndex 1) — verify correct values
    expect(capturedInsertValues[1]).toMatchObject({
      id: "generated-id",
      communityId: "c1",
      unitNumber: "4B",
      active: true,
    });

    // unitOwnerships insert (callIndex 2) — verify homeownerId and startDate
    expect(capturedInsertValues[2]).toMatchObject({
      homeownerId: "h-new",
      startDate: "2024-01-01",
      primary: true,
    });
  });

  it("returns 201 with unitNumber=null and skips units/unitOwnerships inserts when unitNumber is omitted", async () => {
    setSession();
    setMembership("treasurer");
    pushTier(); // assertFeatureTier (no unitNumber, so no assertHomeLimit)

    homeownerReturningResult = [
      {
        id: "h-new",
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@example.com",
        phone: null,
        moveInDate: null,
      },
    ];

    const body = {
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
    };

    let insertCalls = 0;
    mockTransaction.mockImplementationOnce(async (fn: unknown) => {
      const txInsert = vi.fn(() => {
        const callIndex = insertCalls++;
        return {
          values: vi.fn((_vals: unknown) => {
            if (callIndex === 0) {
              return {
                returning: vi.fn().mockResolvedValue(homeownerReturningResult),
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([]),
              onConflictDoUpdate: mockOnConflictDoUpdate,
            };
          }),
        };
      });
      return (
        fn as (tx: {
          insert: typeof txInsert;
          execute: ReturnType<typeof vi.fn>;
          select: ReturnType<typeof vi.fn>;
          from: ReturnType<typeof vi.fn>;
          where: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>
      )({
        insert: txInsert,
        execute: vi.fn(async () => undefined),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          const data = whereQueue[whereCallIdx] ?? [];
          whereCallIdx++;
          return makeWhereResult(data);
        }),
      });
    });

    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(201);
    const resBody = (await res.json()) as {
      homeowner: Record<string, unknown>;
    };
    expect(resBody.homeowner.email).toBe("bob@example.com");
    expect(resBody.homeowner.unitNumber).toBeNull();

    // Without unitNumber: only homeowners + communityActivation = 2 inserts
    expect(insertCalls).toBe(2);
  });

  it("acquires home lock BEFORE assertHomeLimit select inside transaction (POST /communities/:id/homeowners)", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit tier lookup (inside txn via where)

    const callLog: string[] = [];

    mockTransaction.mockImplementationOnce(async (fn: unknown) => {
      insertCallCount = 0;
      const txInsert = buildTxInsert();
      const txWhere = vi.fn().mockImplementation(() => {
        callLog.push("select");
        const data = whereQueue[whereCallIdx] ?? [];
        whereCallIdx++;
        return makeWhereResult(data);
      });
      return (
        fn as (tx: {
          insert: typeof txInsert;
          execute: ReturnType<typeof vi.fn>;
          select: ReturnType<typeof vi.fn>;
          from: ReturnType<typeof vi.fn>;
          where: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>
      )({
        insert: txInsert,
        execute: vi.fn(async (query: unknown) => {
          callLog.push("execute");
          const json = JSON.stringify(query);
          expect(json).toContain("pg_advisory_xact_lock");
          expect(json).toContain("home:");
          return undefined;
        }),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: txWhere,
      });
    });

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
    expect(callLog.indexOf("execute")).toBeGreaterThanOrEqual(0);
    expect(callLog.indexOf("select")).toBeGreaterThanOrEqual(0);
    expect(callLog.indexOf("execute")).toBeLessThan(callLog.indexOf("select"));
  });

  it("marks roster_imported=true in communityActivation after insert (calls onConflictDoUpdate)", async () => {
    setSession();
    setMembership("admin");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    await postSingleAdd("c1", VALID_BODY);
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("accepts secretary role (write role)", async () => {
    setSession();
    setMembership("secretary");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
  });

  it("accepts admin role (write role)", async () => {
    setSession();
    setMembership("admin");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
  });

  it("accepts treasurer role (write role)", async () => {
    setSession();
    setMembership("treasurer");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
  });

  it("returns 409 when a duplicate email unique constraint violation occurs (code 23505)", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const duplicateError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "homeowners_community_id_email_key"',
      ),
      { code: "23505" },
    );
    mockTransaction.mockRejectedValueOnce(duplicateError);

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(
      "A homeowner with this email already exists in this community",
    );
  });

  it("returns 409 on duplicate email when error message contains 'unique'", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const uniqueError = new Error("unique constraint violation");
    mockTransaction.mockRejectedValueOnce(uniqueError);

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(409);
  });

  it("does not swallow non-unique errors — returns 500 for unexpected DB errors", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    const unexpectedError = new Error("connection timeout");
    mockTransaction.mockRejectedValueOnce(unexpectedError);

    // Hono catches re-thrown errors and returns a 500; the error is NOT silently swallowed
    // (it is re-thrown into Hono's error handler rather than being converted to 409)
    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(500);
  });

  it("returns 409 when a non-Error unique violation is thrown (covers String(err) branch)", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)
    // Throwing a plain object (not an Error instance) with a message containing "unique"
    mockTransaction.mockRejectedValueOnce({
      message: "unique violation",
      code: "23505",
    });

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(409);
  });

  it("defaults startDate to today when unitNumber is provided but moveInDate is omitted", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (body has unitNumber)

    const capturedOwnershipValues: Record<string, unknown>[] = [];
    mockTransaction.mockImplementationOnce(async (fn: unknown) => {
      let callIdx = 0;
      const txInsert = vi.fn(() => {
        const idx = callIdx++;
        return {
          values: vi.fn((vals: unknown) => {
            if (idx === 2) {
              capturedOwnershipValues.push(vals as Record<string, unknown>);
            }
            if (idx === 0) {
              return {
                returning: vi.fn().mockResolvedValue([
                  {
                    id: "h-new",
                    firstName: "Carol",
                    lastName: "King",
                    email: "carol@example.com",
                    phone: null,
                    moveInDate: null,
                  },
                ]),
              };
            }
            if (idx === 1) {
              return {
                returning: vi.fn().mockResolvedValue([{ unitNumber: "9A" }]),
                onConflictDoUpdate: mockOnConflictDoUpdate,
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([]),
              onConflictDoUpdate: mockOnConflictDoUpdate,
            };
          }),
        };
      });
      return (
        fn as (tx: {
          insert: typeof txInsert;
          execute: ReturnType<typeof vi.fn>;
          select: ReturnType<typeof vi.fn>;
          from: ReturnType<typeof vi.fn>;
          where: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>
      )({
        insert: txInsert,
        execute: vi.fn(async () => undefined),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          const data = whereQueue[whereCallIdx] ?? [];
          whereCallIdx++;
          return makeWhereResult(data);
        }),
      });
    });

    const body = {
      firstName: "Carol",
      lastName: "King",
      email: "carol@example.com",
      unitNumber: "9A",
      // no moveInDate
    };
    const res = await postSingleAdd("c1", body);
    expect(res.status).toBe(201);

    // startDate should be today's date in YYYY-MM-DD format
    expect(capturedOwnershipValues[0]).toBeDefined();
    expect(
      (capturedOwnershipValues[0] as { startDate: string }).startDate,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns unitNumber=null in response when the units row has no unitNumber", async () => {
    setSession();
    setMembership("owner");
    pushTier(); // assertFeatureTier
    pushTier(); // assertHomeLimit (VALID_BODY has unitNumber)

    mockTransaction.mockImplementationOnce(async (fn: unknown) => {
      let callIdx = 0;
      const txInsert = vi.fn(() => {
        const idx = callIdx++;
        return {
          values: vi.fn((_vals: unknown) => {
            if (idx === 0) {
              return {
                returning: vi
                  .fn()
                  .mockResolvedValue([{ ...DEFAULT_INSERTED_HOMEOWNER }]),
              };
            }
            if (idx === 1) {
              // units insert returns a row with unitNumber: null
              return {
                returning: vi.fn().mockResolvedValue([{ unitNumber: null }]),
                onConflictDoUpdate: mockOnConflictDoUpdate,
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([]),
              onConflictDoUpdate: mockOnConflictDoUpdate,
            };
          }),
        };
      });
      return (
        fn as (tx: {
          insert: typeof txInsert;
          execute: ReturnType<typeof vi.fn>;
          select: ReturnType<typeof vi.fn>;
          from: ReturnType<typeof vi.fn>;
          where: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>
      )({
        insert: txInsert,
        execute: vi.fn(async () => undefined),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          const data = whereQueue[whereCallIdx] ?? [];
          whereCallIdx++;
          return makeWhereResult(data);
        }),
      });
    });

    const res = await postSingleAdd("c1", VALID_BODY);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { homeowner: Record<string, unknown> };
    expect(body.homeowner.unitNumber).toBeNull();
  });
});
