import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => mockLimit());
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockTransactionValues = vi.fn().mockResolvedValue(undefined);
const mockTransactionInsert = vi.fn(() => ({
  values: mockTransactionValues,
}));

const mockTransaction = vi.fn();

const mockDb = {
  select: mockSelect,
  insert: vi.fn(),
  transaction: mockTransaction,
};

const { seedDefaultChartOfAccounts } =
  await import("../../src/domain/accounting/seed.js");

describe("seedDefaultChartOfAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockImplementation(() => mockLimit());
  });

  it("inserts all default accounts when none exist for the community", async () => {
    mockLimit.mockResolvedValueOnce([]); // no existing accounts

    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = {
          insert: mockTransactionInsert,
        };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-1",
    );

    expect(result.created).toBe(true);
    expect(result.count).toBe(14);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockTransactionInsert).toHaveBeenCalledTimes(14);
  });

  it("skips seeding when COA already exists", async () => {
    mockLimit.mockResolvedValueOnce([
      ...Array.from({ length: 14 }, (_, index) => ({
        id: `existing-account-${index}`,
        communityId: "community-1",
        code: [
          "1000",
          "1100",
          "4000",
          "5000",
          "5100",
          "5200",
          "5300",
          "2000",
          "1500",
          "1600",
          "4100",
          "5500",
          "5600",
          "2100",
        ][index],
      })),
    ]);

    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-1",
    );

    expect(result.created).toBe(false);
    expect(result.count).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("inserts missing default accounts when a community is partially seeded", async () => {
    mockLimit.mockResolvedValueOnce([
      { id: "existing-account", communityId: "community-1", code: "1000" },
    ]);

    const insertedCodes: string[] = [];
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn((row: { code: string }) => {
              insertedCodes.push(row.code);
              return Promise.resolve(undefined);
            }),
          })),
        };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-1",
    );

    expect(result).toEqual({ created: true, count: 13 });
    expect(insertedCodes).not.toContain("1000");
    expect(insertedCodes).toContain("4000");
    expect(insertedCodes).toContain("4100");
  });

  it("ignores custom accounts when deciding which default accounts are missing", async () => {
    const existingDefaultCodes = [
      "1000",
      "1100",
      "4000",
      "5000",
      "5100",
      "5200",
      "5300",
      "2000",
      "1500",
      "1600",
      "5500",
      "5600",
      "2100",
    ];
    mockLimit.mockResolvedValueOnce([
      ...existingDefaultCodes.map((code) => ({ code })),
      { code: "9999" },
      { code: "9998" },
    ]);

    const insertedCodes: string[] = [];
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn((row: { code: string }) => {
              insertedCodes.push(row.code);
              return Promise.resolve(undefined);
            }),
          })),
        };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-custom",
    );

    expect(result).toEqual({ created: true, count: 1 });
    expect(insertedCodes).toEqual(["4100"]);
  });

  it("returns created=true and count=14 for a fresh community", async () => {
    mockLimit.mockResolvedValueOnce([]);

    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = { insert: mockTransactionInsert };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "new-community",
    );

    expect(result.created).toBe(true);
    expect(result.count).toBe(14);
  });

  it("inserts operating and reserve accounts (8 operating, 6 reserve)", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const insertedAccounts: Array<{
      code: string;
      fundType: string;
      accountType: string;
      name: string;
    }> = [];

    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn((row: (typeof insertedAccounts)[0]) => {
              insertedAccounts.push(row);
              return Promise.resolve(undefined);
            }),
          })),
        };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-2",
    );

    const operating = insertedAccounts.filter(
      (a) => a.fundType === "operating",
    );
    const reserve = insertedAccounts.filter((a) => a.fundType === "reserve");
    expect(operating.length).toBe(8);
    expect(reserve.length).toBe(6);
  });

  it("uses a transaction for all inserts", async () => {
    mockLimit.mockResolvedValueOnce([]);

    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = { insert: mockTransactionInsert };
        await fn(tx as unknown as typeof mockDb);
      },
    );

    await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-3",
    );

    expect(mockTransaction).toHaveBeenCalledOnce();
    // All inserts happened inside the transaction
    expect(mockTransactionInsert).toHaveBeenCalled();
    // The outer mockDb.insert should NOT be called (only tx.insert)
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  // MINOR-4: concurrent seed — 23505 unique constraint violation must be treated as no-op
  it("treats a 23505 unique constraint error from a concurrent seed as a successful no-op", async () => {
    mockLimit.mockResolvedValueOnce([]); // both processes see 0 accounts

    const pgUniqueError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });

    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => Promise<void>) => {
        const tx = { insert: mockTransactionInsert };
        await fn(tx as unknown as typeof mockDb);
        throw pgUniqueError; // simulate second concurrent seed losing the race
      },
    );

    // Must not throw
    const result = await seedDefaultChartOfAccounts(
      mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
      "community-race",
    );

    // Treated as a no-op (another concurrent seed won)
    expect(result.created).toBe(false);
    expect(result.count).toBe(0);
  });

  it("re-throws non-23505 errors from the transaction", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const otherError = Object.assign(new Error("connection lost"), {
      code: "08006",
    });

    mockTransaction.mockImplementation(async () => {
      throw otherError;
    });

    await expect(
      seedDefaultChartOfAccounts(
        mockDb as unknown as Parameters<typeof seedDefaultChartOfAccounts>[0],
        "community-err",
      ),
    ).rejects.toThrow("connection lost");
  });
});
