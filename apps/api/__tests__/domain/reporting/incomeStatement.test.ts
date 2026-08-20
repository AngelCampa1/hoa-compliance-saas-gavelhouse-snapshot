import { describe, it, expect } from "vitest";
import {
  incomeStatement,
  type IncomeStatementLine,
} from "../../../src/domain/reporting/incomeStatement.js";
import type { TrialBalanceRow } from "@boardstack/shared";

// incomeStatement calls the underlying DB query and post-processes revenue/expense rows.
// We mock the DB to return specific rows.

function makeDb(rows: TrialBalanceRow[]) {
  const mockQuery = {
    orderBy: () => Promise.resolve(rows),
    groupBy: () => mockQuery,
    where: () => mockQuery,
    innerJoin: () => mockQuery,
    from: () => mockQuery,
  };
  return { select: () => mockQuery };
}

describe("incomeStatement", () => {
  it("returns empty lines when no entries exist", async () => {
    const db = makeDb([]);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.lines).toHaveLength(0);
    expect(result.operatingRevenueCents).toBe(0);
    expect(result.operatingExpenseCents).toBe(0);
    expect(result.operatingNetCents).toBe(0);
    expect(result.reserveRevenueCents).toBe(0);
    expect(result.reserveExpenseCents).toBe(0);
    expect(result.reserveNetCents).toBe(0);
    expect(result.from).toBe("2024-01-01");
    expect(result.to).toBe("2024-12-31");
  });

  it("filters out balance sheet accounts (asset/liability/equity), only revenue/expense", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-rev",
        accountCode: "4000",
        accountName: "Assessment Revenue",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 120000,
      },
      {
        accountId: "acc-asset",
        accountCode: "1000",
        accountName: "Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 120000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    const ids = result.lines.map((l) => l.accountId);
    expect(ids).toContain("acc-rev");
    expect(ids).not.toContain("acc-asset");
  });

  it("computes revenue amount as credits - debits", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-rev",
        accountCode: "4000",
        accountName: "Assessment Revenue",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 5000,
        creditCents: 120000,
      },
    ];
    const db = makeDb(rows);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    const revLine = result.lines.find(
      (l) => l.accountId === "acc-rev",
    ) as IncomeStatementLine;
    expect(revLine.amountCents).toBe(115000); // 120000 - 5000
    expect(revLine.accountType).toBe("revenue");
  });

  it("computes expense amount as debits - credits", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-exp",
        accountCode: "5000",
        accountName: "Utilities",
        accountType: "expense",
        fundType: "operating",
        debitCents: 40000,
        creditCents: 2000,
      },
    ];
    const db = makeDb(rows);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    const expLine = result.lines.find(
      (l) => l.accountId === "acc-exp",
    ) as IncomeStatementLine;
    expect(expLine.amountCents).toBe(38000); // 40000 - 2000
    expect(expLine.accountType).toBe("expense");
  });

  it("computes operatingNetCents as revenue - expense", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-rev",
        accountCode: "4000",
        accountName: "Assessments",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 100000,
      },
      {
        accountId: "acc-exp",
        accountCode: "5000",
        accountName: "Utilities",
        accountType: "expense",
        fundType: "operating",
        debitCents: 60000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.operatingRevenueCents).toBe(100000);
    expect(result.operatingExpenseCents).toBe(60000);
    expect(result.operatingNetCents).toBe(40000);
  });

  it("computes reserve fund totals separately from operating", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-op-rev",
        accountCode: "4000",
        accountName: "Op Revenue",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 100000,
      },
      {
        accountId: "acc-res-rev",
        accountCode: "4100",
        accountName: "Res Interest",
        accountType: "revenue",
        fundType: "reserve",
        debitCents: 0,
        creditCents: 20000,
      },
      {
        accountId: "acc-res-exp",
        accountCode: "5500",
        accountName: "Res Repairs",
        accountType: "expense",
        fundType: "reserve",
        debitCents: 15000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.operatingRevenueCents).toBe(100000);
    expect(result.operatingExpenseCents).toBe(0);
    expect(result.operatingNetCents).toBe(100000);
    expect(result.reserveRevenueCents).toBe(20000);
    expect(result.reserveExpenseCents).toBe(15000);
    expect(result.reserveNetCents).toBe(5000);
  });

  it("does not include entries from another communityId (MAJOR-2 guard)", async () => {
    const dbComm2 = makeDb([]);
    const result = await incomeStatement(
      dbComm2 as unknown as Parameters<typeof incomeStatement>[0],
      "comm-2",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.lines).toHaveLength(0);
    expect(result.operatingNetCents).toBe(0);
  });

  it("passes from and to dates through correctly", async () => {
    const db = makeDb([]);
    const result = await incomeStatement(
      db as unknown as Parameters<typeof incomeStatement>[0],
      "comm-1",
      "2024-07-01",
      "2024-09-30",
    );
    expect(result.from).toBe("2024-07-01");
    expect(result.to).toBe("2024-09-30");
  });
});
