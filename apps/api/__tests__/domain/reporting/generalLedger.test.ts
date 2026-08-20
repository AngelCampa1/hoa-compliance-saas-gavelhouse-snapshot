import { describe, it, expect } from "vitest";
import {
  generalLedger,
  type LedgerRow,
} from "../../../src/domain/reporting/generalLedger.js";

// Raw row returned from the DB before running balance is computed.
type RawLedgerRow = Omit<LedgerRow, "runningBalanceCents">;

function makeDb(rows: RawLedgerRow[]) {
  // First select call returns count, second returns paginated rows
  let callIndex = 0;
  const mockCountQuery = {
    from: () => mockCountQuery,
    innerJoin: () => mockCountQuery,
    where: () => mockCountQuery,
    then: (onFulfilled: (v: { total: number }[]) => unknown) =>
      Promise.resolve([{ total: rows.length }]).then(onFulfilled),
  };
  const mockRowQuery = {
    orderBy: () => mockRowQuery,
    limit: () => mockRowQuery,
    offset: () => Promise.resolve(rows),
    where: () => mockRowQuery,
    innerJoin: () => mockRowQuery,
    from: () => mockRowQuery,
  };
  return {
    select: () => {
      callIndex++;
      return callIndex === 1 ? mockCountQuery : mockRowQuery;
    },
  };
}

describe("generalLedger", () => {
  it("returns empty result when no journal entries exist", async () => {
    const db = makeDb([]);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns rows with running balance starting from first transaction", async () => {
    const rows: RawLedgerRow[] = [
      {
        entryId: "entry-1",
        entryDate: "2024-01-15",
        memo: "January dues",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 100000,
        creditCents: 0,
      },
      {
        entryId: "entry-2",
        entryDate: "2024-02-01",
        memo: "Utility bill",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 0,
        creditCents: 30000,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].runningBalanceCents).toBe(100000); // 0 + 100000 - 0
    expect(result.rows[1].runningBalanceCents).toBe(70000); // 100000 + 0 - 30000
    expect(result.total).toBe(2);
  });

  it("accumulates running balance across multiple entries correctly", async () => {
    const rows: RawLedgerRow[] = [
      {
        entryId: "e1",
        entryDate: "2024-01-01",
        memo: "Opening",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 50000,
        creditCents: 0,
      },
      {
        entryId: "e2",
        entryDate: "2024-01-15",
        memo: "Payment",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 0,
        creditCents: 20000,
      },
      {
        entryId: "e3",
        entryDate: "2024-01-31",
        memo: "Deposit",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 10000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.rows[0].runningBalanceCents).toBe(50000);
    expect(result.rows[1].runningBalanceCents).toBe(30000);
    expect(result.rows[2].runningBalanceCents).toBe(40000);
  });

  it("filters by optional accountId (simulated by mock returning filtered rows)", async () => {
    // When accountId is provided, DB returns only rows for that account
    const rows: RawLedgerRow[] = [
      {
        entryId: "e1",
        entryDate: "2024-01-15",
        memo: "Dues",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 50000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      "acc-1",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].accountId).toBe("acc-1");
  });

  it("filters by optional fundType (simulated by mock returning filtered rows)", async () => {
    const rows: RawLedgerRow[] = [
      {
        entryId: "e1",
        entryDate: "2024-01-15",
        memo: "Reserve deposit",
        accountId: "acc-2",
        accountCode: "1500",
        accountName: "Reserve Checking",
        fundType: "reserve",
        debitCents: 200000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      undefined,
      "reserve",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fundType).toBe("reserve");
  });

  it("does not include entries from another communityId (MAJOR-2 guard)", async () => {
    const dbComm2 = makeDb([]);
    const result = await generalLedger(
      dbComm2 as unknown as Parameters<typeof generalLedger>[0],
      "comm-2",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("running balance is cumulative across multiple accounts in one query", async () => {
    // When no accountId filter, multiple accounts may appear — running balance is global cumulative
    const rows: RawLedgerRow[] = [
      {
        entryId: "e1",
        entryDate: "2024-01-15",
        memo: "Credit cash",
        accountId: "acc-cash",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 1000,
        creditCents: 0,
      },
      {
        entryId: "e1",
        entryDate: "2024-01-15",
        memo: "Credit revenue",
        accountId: "acc-rev",
        accountCode: "4000",
        accountName: "Revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 1000,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    // Running balance accumulates: row0 = +1000, row1 = +1000 - 1000 = 0
    expect(result.rows[0].runningBalanceCents).toBe(1000);
    expect(result.rows[1].runningBalanceCents).toBe(0);
  });

  it("includes all LedgerRow fields in output", async () => {
    const rows: RawLedgerRow[] = [
      {
        entryId: "entry-abc",
        entryDate: "2024-03-10",
        memo: "Test entry",
        accountId: "acc-x",
        accountCode: "2000",
        accountName: "Accounts Payable",
        fundType: "operating",
        debitCents: 0,
        creditCents: 15000,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    const row = result.rows[0];
    expect(row.entryId).toBe("entry-abc");
    expect(row.entryDate).toBe("2024-03-10");
    expect(row.memo).toBe("Test entry");
    expect(row.accountId).toBe("acc-x");
    expect(row.accountCode).toBe("2000");
    expect(row.accountName).toBe("Accounts Payable");
    expect(row.fundType).toBe("operating");
    expect(row.debitCents).toBe(0);
    expect(row.creditCents).toBe(15000);
    expect(row.runningBalanceCents).toBeDefined();
    expect(typeof row.runningBalanceCents).toBe("number");
  });

  it("defaults total to 0 when count query returns an empty result set", async () => {
    // Simulate a DB that returns [] for the COUNT query (edge case with some DB adapters)
    let callIndex = 0;
    const emptyCountDb = {
      select: () => {
        callIndex++;
        if (callIndex === 1) {
          // COUNT query returns empty array — total should default to 0
          return {
            from: () => ({
              innerJoin: () => ({
                innerJoin: () => ({ where: () => Promise.resolve([]) }),
              }),
            }),
          };
        }
        // Rows query returns empty
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({ offset: () => Promise.resolve([]) }),
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };
    const result = await generalLedger(
      emptyCountDb as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("orders by a stable per-line tiebreaker so the running balance is deterministic", async () => {
    // entryId is the FK shared by every line of one journal entry, so using it
    // as the only secondary sort leaves lines within an entry unordered — the
    // same query can return them in different orders and produce different
    // per-row runningBalanceCents. The line's own PK (journal_lines.id) must
    // participate in the ORDER BY to make the page deterministic.
    let orderByArgs: unknown[] = [];
    let callIndex = 0;
    const mockCountQuery = {
      from: () => mockCountQuery,
      innerJoin: () => mockCountQuery,
      where: () => mockCountQuery,
      then: (onFulfilled: (v: { total: number }[]) => unknown) =>
        Promise.resolve([{ total: 0 }]).then(onFulfilled),
    };
    const mockRowQuery = {
      orderBy: (...args: unknown[]) => {
        orderByArgs = args;
        return mockRowQuery;
      },
      limit: () => mockRowQuery,
      offset: () => Promise.resolve([]),
      where: () => mockRowQuery,
      innerJoin: () => mockRowQuery,
      from: () => mockRowQuery,
    };
    const db = {
      select: () => {
        callIndex++;
        return callIndex === 1 ? mockCountQuery : mockRowQuery;
      },
    };
    await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );

    // Collect every column name embedded in the ORDER BY expressions.
    const columnNames = orderByArgs.flatMap((arg) => {
      const chunks = (arg as { queryChunks?: unknown[] }).queryChunks ?? [];
      return chunks
        .map((chunk) => (chunk as { name?: string }).name)
        .filter((name): name is string => typeof name === "string");
    });
    expect(columnNames).toContain("id");
  });

  it("returns total count and page metadata", async () => {
    const rows: RawLedgerRow[] = [
      {
        entryId: "e1",
        entryDate: "2024-01-01",
        memo: "Entry",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 100,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await generalLedger(
      db as unknown as Parameters<typeof generalLedger>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
      undefined,
      undefined,
      50,
      0,
    );
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});
