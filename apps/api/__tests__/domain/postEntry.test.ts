import { describe, it, expect, vi } from "vitest";
import {
  postEntry,
  CommingleError,
} from "../../src/domain/accounting/postEntry.js";

// We will build a mock DB that simulates the drizzle interface
// used in postEntry: db.select().from().where(), db.transaction()

type MockAccount = {
  id: string;
  communityId: string;
  fundType: "operating" | "reserve";
  name: string;
  code: string;
  accountType: string;
  active: boolean;
};

function makeMockDb(accounts: MockAccount[]) {
  const insertedEntries: unknown[] = [];
  const insertedLines: unknown[] = [];

  const mockInsert = vi.fn((_table: unknown) => {
    return {
      values: vi.fn((row: unknown) => {
        // Distinguish by shape
        const r = row as Record<string, unknown>;
        if ("memo" in r) {
          insertedEntries.push(row);
        } else {
          insertedLines.push(row);
        }
        return Promise.resolve(undefined);
      }),
    };
  });

  const mockTransaction = vi.fn(
    async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => {
      const tx = makeTx();
      await fn(tx);
    },
  );

  function makeTx() {
    return {
      insert: vi.fn((_table: unknown) => {
        return {
          values: vi.fn((row: unknown) => {
            const r = row as Record<string, unknown>;
            if ("memo" in r) {
              insertedEntries.push(row);
            } else {
              insertedLines.push(row);
            }
            return Promise.resolve(undefined);
          }),
        };
      }),
    };
  }

  // select builder that filters accounts by id + communityId
  const mockSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((_condition: unknown) => {
        // We intercept at limit(1) — return matching account
        return {
          limit: vi.fn((_n: number) => {
            // The condition encodes accountId + communityId — we return all
            // accounts (the postEntry code queries one at a time via different
            // filter conditions). We simulate by returning array based on
            // the condition being called sequentially.
            // Since we cannot actually evaluate drizzle conditions,
            // we use a queue approach — each call pops one account.
            const next = pendingAccounts.shift();
            return Promise.resolve(next ? [next] : []);
          }),
        };
      }),
    })),
  }));

  let pendingAccounts = [...accounts];

  return {
    select: mockSelect,
    insert: mockInsert,
    transaction: mockTransaction,
    _insertedEntries: insertedEntries,
    _insertedLines: insertedLines,
    _resetPending: (accts: MockAccount[]) => {
      pendingAccounts = [...accts];
    },
  };
}

const opAccount: MockAccount = {
  id: "op-acc-1",
  communityId: "comm-1",
  fundType: "operating",
  name: "Operating Checking",
  code: "1000",
  accountType: "asset",
  active: true,
};

const opAccount2: MockAccount = {
  id: "op-acc-2",
  communityId: "comm-1",
  fundType: "operating",
  name: "Assessment Revenue",
  code: "4000",
  accountType: "revenue",
  active: true,
};

const resAccount: MockAccount = {
  id: "res-acc-1",
  communityId: "comm-1",
  fundType: "reserve",
  name: "Reserve Checking",
  code: "1500",
  accountType: "asset",
  active: true,
};

const resAccount2: MockAccount = {
  id: "res-acc-2",
  communityId: "comm-1",
  fundType: "reserve",
  name: "Reserve Revenue",
  code: "4100",
  accountType: "revenue",
  active: true,
};

describe("postEntry domain service", () => {
  it("accepts a valid 2-line operating entry (debit + credit same fund)", async () => {
    const db = makeMockDb([opAccount, opAccount2]);
    const result = await postEntry(
      db as unknown as Parameters<typeof postEntry>[0],
      {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Operating entry",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 1000 },
        ],
      },
    );

    expect(result.entryId).toBeDefined();
    expect(result.lineCount).toBe(2);
  });

  it("accepts a valid 2-line reserve entry", async () => {
    const db = makeMockDb([resAccount, resAccount2]);
    const result = await postEntry(
      db as unknown as Parameters<typeof postEntry>[0],
      {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Reserve entry",
        lines: [
          { accountId: "res-acc-1", debitCents: 5000, creditCents: 0 },
          { accountId: "res-acc-2", debitCents: 0, creditCents: 5000 },
        ],
      },
    );

    expect(result.entryId).toBeDefined();
    expect(result.lineCount).toBe(2);
  });

  it("accepts a 4-line entry spanning both funds when each fund balances independently", async () => {
    // Operating: debit 1000 + credit 1000 = balanced
    // Reserve: debit 2000 + credit 2000 = balanced
    const db = makeMockDb([opAccount, opAccount2, resAccount, resAccount2]);
    const result = await postEntry(
      db as unknown as Parameters<typeof postEntry>[0],
      {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Cross-fund transfer",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 1000 },
          { accountId: "res-acc-1", debitCents: 2000, creditCents: 0 },
          { accountId: "res-acc-2", debitCents: 0, creditCents: 2000 },
        ],
      },
    );

    expect(result.lineCount).toBe(4);
  });

  it("throws CommingleError when op-debit=1000 but res-credit=1000 (funds don't individually balance)", async () => {
    // Line 1: op account debit 1000 — operating debit=1000, credit=0
    // Line 2: res account credit 1000 — reserve debit=0, credit=1000
    // Operating: debit 1000 ≠ credit 0 → unbalanced
    // Reserve: debit 0 ≠ credit 1000 → unbalanced
    const db = makeMockDb([opAccount, resAccount]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Commingling attempt",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "res-acc-1", debitCents: 0, creditCents: 1000 },
        ],
      }),
    ).rejects.toThrow(CommingleError);
  });

  it("throws CommingleError when operating fund is imbalanced (debit 1000, credit 500)", async () => {
    const opAccount3: MockAccount = {
      id: "op-acc-3",
      communityId: "comm-1",
      fundType: "operating",
      name: "AP Operating",
      code: "2000",
      accountType: "liability",
      active: true,
    };
    const db = makeMockDb([opAccount, opAccount3]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Imbalanced operating",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-3", debitCents: 0, creditCents: 500 },
        ],
      }),
    ).rejects.toThrow(CommingleError);
  });

  it("CommingleError message contains operating and reserve fund details", async () => {
    const db = makeMockDb([opAccount, resAccount]);
    let caught: unknown;
    try {
      await postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Commingling attempt",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "res-acc-1", debitCents: 0, creditCents: 1000 },
        ],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CommingleError);
    const msg = (caught as CommingleError).message;
    expect(msg).toContain("Operating");
    expect(msg).toContain("Reserve");
  });

  it("throws Error when only 1 line is provided", async () => {
    const db = makeMockDb([opAccount]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Single line",
        lines: [{ accountId: "op-acc-1", debitCents: 1000, creditCents: 0 }],
      }),
    ).rejects.toThrow("Journal entry must have at least 2 lines");
  });

  it("throws Error when a line has both debitCents and creditCents > 0", async () => {
    const db = makeMockDb([opAccount, opAccount2]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Both sides non-zero",
        lines: [
          { accountId: "op-acc-1", debitCents: 500, creditCents: 500 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow(
      "Each journal line must have exactly one of debitCents or creditCents > 0",
    );
  });

  it("throws Error when a line has both debitCents and creditCents equal 0", async () => {
    const db = makeMockDb([opAccount, opAccount2]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Both sides zero",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow(
      "Each journal line must have exactly one of debitCents or creditCents > 0",
    );
  });

  it("throws Error when accountId is not found in the community", async () => {
    const db = makeMockDb([]); // No accounts returned — simulate not found
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Missing account",
        lines: [
          { accountId: "nonexistent-1", debitCents: 1000, creditCents: 0 },
          { accountId: "nonexistent-2", debitCents: 0, creditCents: 1000 },
        ],
      }),
    ).rejects.toThrow("Account not found in this community: nonexistent-1");
  });

  it("throws Error when accountId belongs to a different community", async () => {
    // Return empty (as if community filter excluded it)
    const db = makeMockDb([]);
    await expect(
      postEntry(db as unknown as Parameters<typeof postEntry>[0], {
        communityId: "comm-2",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Wrong community",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 1000 },
        ],
      }),
    ).rejects.toThrow("Account not found in this community: op-acc-1");
  });

  it("copies fundType from account onto the inserted line (not from caller)", async () => {
    const db = makeMockDb([opAccount, opAccount2]);

    // Capture what gets inserted in the transaction
    const capturedLines: unknown[] = [];
    const mockTx = {
      insert: vi.fn(() => ({
        values: vi.fn((row: unknown) => {
          capturedLines.push(row);
          return Promise.resolve(undefined);
        }),
      })),
    };

    const realTransaction = db.transaction;
    db.transaction = vi.fn(async (fn) => {
      await fn(mockTx as unknown as Parameters<typeof fn>[0]);
    }) as typeof db.transaction;

    await postEntry(db as unknown as Parameters<typeof postEntry>[0], {
      communityId: "comm-1",
      createdByUserId: "user-1",
      entryDate: "2024-01-15",
      memo: "Fund type verification",
      lines: [
        { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
        { accountId: "op-acc-2", debitCents: 0, creditCents: 1000 },
      ],
    });

    // capturedLines[0] is the journal entry row, capturedLines[1] and [2] are journal lines
    const lineRows = capturedLines.filter(
      (r) =>
        (r as Record<string, unknown>)["fundType"] !== undefined &&
        (r as Record<string, unknown>)["entryId"] !== undefined,
    );
    expect(lineRows.length).toBe(2);
    for (const line of lineRows) {
      expect((line as Record<string, unknown>)["fundType"]).toBe("operating");
    }

    db.transaction = realTransaction;
  });

  it("persists directly when given a transaction-like handle without transaction()", async () => {
    const db = makeMockDb([opAccount, opAccount2]);
    const txLike = {
      select: db.select,
      insert: db.insert,
    };

    const result = await postEntry(
      txLike as unknown as Parameters<typeof postEntry>[0],
      {
        communityId: "comm-1",
        createdByUserId: "user-1",
        entryDate: "2024-01-15",
        memo: "Direct persist",
        lines: [
          { accountId: "op-acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "op-acc-2", debitCents: 0, creditCents: 1000 },
        ],
      },
    );

    expect(result.lineCount).toBe(2);
    expect(db._insertedEntries).toHaveLength(1);
    expect(db._insertedLines).toHaveLength(2);
  });
});
