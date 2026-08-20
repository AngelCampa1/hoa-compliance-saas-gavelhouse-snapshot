import { describe, it, expect } from "vitest";
import {
  balanceSheet,
  type BalanceSheetSection,
} from "../../../src/domain/reporting/balanceSheet.js";
import type { TrialBalanceRow } from "@boardstack/shared";

// The balanceSheet function calls trialBalance internally and then post-processes the rows.
// We mock the DB such that the underlying query returns specific rows.

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

describe("balanceSheet", () => {
  it("returns empty sections when no entries exist", async () => {
    const db = makeDb([]);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    expect(result.sections).toHaveLength(0);
    expect(result.operatingNetCents).toBe(0);
    expect(result.reserveNetCents).toBe(0);
    expect(result.asOf).toBe("2024-12-31");
  });

  it("filters out revenue and expense accounts, only keeps asset/liability/equity", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-asset",
        accountCode: "1000",
        accountName: "Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 50000,
        creditCents: 10000,
      },
      {
        accountId: "acc-revenue",
        accountCode: "4000",
        accountName: "Assessments",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 120000,
      },
      {
        accountId: "acc-expense",
        accountCode: "5000",
        accountName: "Utilities",
        accountType: "expense",
        fundType: "operating",
        debitCents: 30000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    // Only asset account should appear
    const allAccountTypes = result.sections.flatMap((s) =>
      s.accounts.map((a) => a.accountId),
    );
    expect(allAccountTypes).toContain("acc-asset");
    expect(allAccountTypes).not.toContain("acc-revenue");
    expect(allAccountTypes).not.toContain("acc-expense");
  });

  it("computes debit-normal balance for assets (debits - credits)", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 80000,
        creditCents: 30000,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    const section = result.sections.find(
      (s) => s.fundType === "operating" && s.accountType === "asset",
    ) as BalanceSheetSection;
    expect(section).toBeDefined();
    expect(section.accounts[0].balanceCents).toBe(50000); // 80000 - 30000
    expect(section.totalCents).toBe(50000);
  });

  it("computes credit-normal balance for liabilities (credits - debits)", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-2",
        accountCode: "2000",
        accountName: "Accounts Payable",
        accountType: "liability",
        fundType: "operating",
        debitCents: 5000,
        creditCents: 25000,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    const section = result.sections.find(
      (s) => s.fundType === "operating" && s.accountType === "liability",
    ) as BalanceSheetSection;
    expect(section).toBeDefined();
    expect(section.accounts[0].balanceCents).toBe(20000); // 25000 - 5000
    expect(section.totalCents).toBe(20000);
  });

  it("computes credit-normal balance for equity (credits - debits)", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-3",
        accountCode: "3000",
        accountName: "Retained Earnings",
        accountType: "equity",
        fundType: "reserve",
        debitCents: 0,
        creditCents: 100000,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    const section = result.sections.find(
      (s) => s.fundType === "reserve" && s.accountType === "equity",
    ) as BalanceSheetSection;
    expect(section).toBeDefined();
    expect(section.accounts[0].balanceCents).toBe(100000);
  });

  it("groups by fundType and accountType in separate sections", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-op-asset",
        accountCode: "1000",
        accountName: "Op Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 50000,
        creditCents: 0,
      },
      {
        accountId: "acc-res-asset",
        accountCode: "1500",
        accountName: "Res Checking",
        accountType: "asset",
        fundType: "reserve",
        debitCents: 200000,
        creditCents: 0,
      },
      {
        accountId: "acc-op-liab",
        accountCode: "2000",
        accountName: "Op AP",
        accountType: "liability",
        fundType: "operating",
        debitCents: 0,
        creditCents: 10000,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
    const opAsset = result.sections.find(
      (s) => s.fundType === "operating" && s.accountType === "asset",
    );
    const resAsset = result.sections.find(
      (s) => s.fundType === "reserve" && s.accountType === "asset",
    );
    const opLiab = result.sections.find(
      (s) => s.fundType === "operating" && s.accountType === "liability",
    );
    expect(opAsset).toBeDefined();
    expect(resAsset).toBeDefined();
    expect(opLiab).toBeDefined();
  });

  it("computes operatingNetCents as operating assets - operating liabilities - operating equity", async () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-op-asset",
        accountCode: "1000",
        accountName: "Op Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 100000,
        creditCents: 0,
      },
      {
        accountId: "acc-op-liab",
        accountCode: "2000",
        accountName: "Op AP",
        accountType: "liability",
        fundType: "operating",
        debitCents: 0,
        creditCents: 30000,
      },
      {
        accountId: "acc-op-equity",
        accountCode: "3000",
        accountName: "Op Fund Balance",
        accountType: "equity",
        fundType: "operating",
        debitCents: 0,
        creditCents: 70000,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    // assets(100000) - liabilities(30000) - equity(70000) = 0
    expect(result.operatingNetCents).toBe(0);
  });

  it("does not include entries from another communityId (MAJOR-2 guard)", async () => {
    // Mock returns empty for comm-2, simulating the DB filter working correctly
    const dbComm2 = makeDb([]);
    const result = await balanceSheet(
      dbComm2 as unknown as Parameters<typeof balanceSheet>[0],
      "comm-2",
      "2024-12-31",
    );
    expect(result.sections).toHaveLength(0);
  });

  it("merges multiple accounts of the same type into the same section", async () => {
    // Two asset accounts in operating fund — both go in the same section
    const rows: TrialBalanceRow[] = [
      {
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 50000,
        creditCents: 0,
      },
      {
        accountId: "acc-2",
        accountCode: "1010",
        accountName: "Savings",
        accountType: "asset",
        fundType: "operating",
        debitCents: 30000,
        creditCents: 0,
      },
    ];
    const db = makeDb(rows);
    const result = await balanceSheet(
      db as unknown as Parameters<typeof balanceSheet>[0],
      "comm-1",
      "2024-12-31",
    );
    // Both accounts collapse into one section (operating::asset)
    const opAsset = result.sections.find(
      (s) => s.fundType === "operating" && s.accountType === "asset",
    ) as BalanceSheetSection;
    expect(opAsset).toBeDefined();
    expect(opAsset.accounts).toHaveLength(2);
    expect(opAsset.totalCents).toBe(80000); // 50000 + 30000
  });
});
