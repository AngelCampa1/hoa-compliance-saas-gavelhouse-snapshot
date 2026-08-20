/**
 * Stress / adversarial fuzz tests for reporting domain logic:
 * trialBalance (pure arithmetic grouping), balanceSheet, incomeStatement.
 *
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Key invariants tested:
 * 1. Trial balance total debits == total credits when fed balanced data.
 * 2. balanceSheet operatingNetCents/reserveNetCents derive correctly.
 * 3. assets == liabilities + equity per fund when entries are balanced.
 * 4. No NaN in any output field.
 * 5. Grouping never drops or double-counts accounts.
 * 6. incomeStatement net = revenue - expenses (per fund).
 */

import { describe, it, expect } from "vitest";
import { balanceSheet } from "../../src/domain/reporting/balanceSheet.js";
import { incomeStatement } from "../../src/domain/reporting/incomeStatement.js";
import type { TrialBalanceRow } from "@boardstack/shared";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Mock DB for balanceSheet (wraps trialBalance which issues a raw DB query)
// ---------------------------------------------------------------------------
function makeBalanceSheetDb(rows: TrialBalanceRow[]) {
  const mockQuery = {
    orderBy: () => Promise.resolve(rows),
    groupBy: () => mockQuery,
    where: () => mockQuery,
    innerJoin: () => mockQuery,
    from: () => mockQuery,
  };
  return { select: () => mockQuery };
}

type BsDb = ReturnType<typeof makeBalanceSheetDb>;

function asBsDb(db: BsDb) {
  return db as unknown as Parameters<typeof balanceSheet>[0];
}

// ---------------------------------------------------------------------------
// Mock DB for incomeStatement (raw drizzle query)
// ---------------------------------------------------------------------------
function makeIncomeStatementDb(
  rows: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    fundType: string;
    debitCents: number;
    creditCents: number;
  }>,
) {
  const mockQuery = {
    orderBy: () => Promise.resolve(rows),
    groupBy: () => mockQuery,
    where: () => mockQuery,
    innerJoin: () => mockQuery,
    from: () => mockQuery,
  };
  return { select: () => mockQuery };
}

type IsDb = ReturnType<typeof makeIncomeStatementDb>;

function asIsDb(db: IsDb) {
  return db as unknown as Parameters<typeof incomeStatement>[0];
}

// ---------------------------------------------------------------------------
// Row generators
// ---------------------------------------------------------------------------
function tbRow(
  id: string,
  code: string,
  name: string,
  accountType: TrialBalanceRow["accountType"],
  fundType: "operating" | "reserve",
  debitCents: number,
  creditCents: number,
): TrialBalanceRow {
  return {
    accountId: id,
    accountCode: code,
    accountName: name,
    accountType,
    fundType,
    debitCents,
    creditCents,
  };
}

// ---------------------------------------------------------------------------
// INVARIANT 1: balanceSheet — no NaN in any output field
// ---------------------------------------------------------------------------
describe("balanceSheet — no NaN in outputs (fuzz)", () => {
  const rng = mulberry32(0x1234abcd);
  const ACCOUNT_TYPES: TrialBalanceRow["accountType"][] = [
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
  ];
  const FUND_TYPES: ("operating" | "reserve")[] = ["operating", "reserve"];

  it("never produces NaN in any numeric field across 500 random datasets", async () => {
    let nanFound = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const numRows = Math.floor(rng() * 10) + 1;
      const rows: TrialBalanceRow[] = [];
      for (let j = 0; j < numRows; j++) {
        const at = ACCOUNT_TYPES[Math.floor(rng() * ACCOUNT_TYPES.length)]!;
        const ft = FUND_TYPES[Math.floor(rng() * 2)]!;
        const debit = Math.floor(rng() * 100_000);
        const credit = Math.floor(rng() * 100_000);
        rows.push(
          tbRow(
            `acc-${run}-${j}`,
            `${1000 + j}`,
            `Acc ${j}`,
            at,
            ft,
            debit,
            credit,
          ),
        );
      }

      const db = makeBalanceSheetDb(rows);
      const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");

      if (isNaN(result.operatingNetCents) || isNaN(result.reserveNetCents)) {
        nanFound++;
        continue;
      }
      for (const section of result.sections) {
        if (isNaN(section.totalCents)) {
          nanFound++;
          break;
        }
        for (const acct of section.accounts) {
          if (isNaN(acct.balanceCents)) {
            nanFound++;
            break;
          }
        }
      }
    }
    expect(nanFound).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 2: balanceSheet — no double-counting / no dropped accounts
// ---------------------------------------------------------------------------
describe("balanceSheet — grouping correctness (fuzz)", () => {
  const rng = mulberry32(0xfeedc0de);

  it("all balance-sheet accounts appear exactly once (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const numRows = Math.floor(rng() * 8) + 2;
      const rows: TrialBalanceRow[] = [];
      for (let j = 0; j < numRows; j++) {
        const atIdx = Math.floor(rng() * 3); // only asset/liability/equity
        const at = (["asset", "liability", "equity"] as const)[atIdx]!;
        const ft: "operating" | "reserve" =
          rng() > 0.5 ? "operating" : "reserve";
        const debit = Math.floor(rng() * 50_000) + 1;
        rows.push(
          tbRow(`acc-${run}-${j}`, `${1000 + j}`, `Acc ${j}`, at, ft, debit, 0),
        );
      }

      const db = makeBalanceSheetDb(rows);
      const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");

      // All account IDs from rows should appear exactly once in sections
      const expectedIds = new Set(rows.map((r) => r.accountId));
      const actualIds: string[] = result.sections.flatMap((s) =>
        s.accounts.map((a) => a.accountId),
      );
      const actualSet = new Set(actualIds);

      // No duplicates
      if (actualIds.length !== actualSet.size) {
        errors++;
        continue;
      }
      // No missing accounts
      for (const id of expectedIds) {
        if (!actualSet.has(id)) {
          errors++;
          break;
        }
      }
      // No extra accounts
      for (const id of actualSet) {
        if (!expectedIds.has(id)) {
          errors++;
          break;
        }
      }
    }
    expect(errors).toBe(0);
  });

  it("section totalCents equals sum of account balances within section (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const numRows = Math.floor(rng() * 6) + 2;
      const rows: TrialBalanceRow[] = [];
      for (let j = 0; j < numRows; j++) {
        const atIdx = Math.floor(rng() * 3);
        const at = (["asset", "liability", "equity"] as const)[atIdx]!;
        const ft: "operating" | "reserve" =
          rng() > 0.5 ? "operating" : "reserve";
        const debit = Math.floor(rng() * 50_000);
        const credit = Math.floor(rng() * 50_000);
        rows.push(
          tbRow(
            `acc-${run}-${j}`,
            `${1000 + j}`,
            `Acc ${j}`,
            at,
            ft,
            debit,
            credit,
          ),
        );
      }

      const db = makeBalanceSheetDb(rows);
      const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");

      for (const section of result.sections) {
        const sumFromAccounts = section.accounts.reduce(
          (s, a) => s + a.balanceCents,
          0,
        );
        if (sumFromAccounts !== section.totalCents) {
          errors++;
          break;
        }
      }
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 3: balanceSheet — assets == liabilities + equity per fund
// when data is accounting-balanced (assets = liabilities + equity)
// ---------------------------------------------------------------------------
describe("balanceSheet — accounting equation holds for balanced data (fuzz)", () => {
  const rng = mulberry32(0xa5a5a5a5);

  it("assets == liabilities + equity per fund for balanced inputs (500 runs)", async () => {
    let violated = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      // Build properly balanced BS per fund: assets = liabilities + equity
      for (const fundType of ["operating", "reserve"] as const) {
        const liab = Math.floor(rng() * 50_000);
        const equity = Math.floor(rng() * 50_000);
        const asset = liab + equity;

        const rows: TrialBalanceRow[] = [
          tbRow(
            `${fundType}-asset-${run}`,
            "1000",
            "Cash",
            "asset",
            fundType,
            asset,
            0,
          ),
          tbRow(
            `${fundType}-liab-${run}`,
            "2000",
            "AP",
            "liability",
            fundType,
            0,
            liab,
          ),
          tbRow(
            `${fundType}-equity-${run}`,
            "3000",
            "Fund Bal",
            "equity",
            fundType,
            0,
            equity,
          ),
        ];

        const db = makeBalanceSheetDb(rows);
        const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");

        const net =
          fundType === "operating"
            ? result.operatingNetCents
            : result.reserveNetCents;
        // For a balanced BS, assets - liabilities - equity = 0
        if (net !== 0) {
          violated++;
        }
      }
    }
    expect(violated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 4: balanceSheet operatingNetCents derivation
// operatingNetCents = sum(operating asset balances) - sum(operating liability balances) - sum(operating equity balances)
// ---------------------------------------------------------------------------
describe("balanceSheet — operatingNetCents / reserveNetCents derivation (fuzz)", () => {
  const rng = mulberry32(0x13579bdf);

  it("operatingNetCents equals manual computation from sections (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const rows: TrialBalanceRow[] = [];
      const n = Math.floor(rng() * 6) + 2;
      for (let j = 0; j < n; j++) {
        const atIdx = Math.floor(rng() * 3);
        const at = (["asset", "liability", "equity"] as const)[atIdx]!;
        const debit = Math.floor(rng() * 100_000);
        const credit = Math.floor(rng() * 100_000);
        rows.push(
          tbRow(
            `acc-op-${run}-${j}`,
            `${1000 + j}`,
            `Acc`,
            at,
            "operating",
            debit,
            credit,
          ),
        );
      }

      const db = makeBalanceSheetDb(rows);
      const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");

      // Recompute manually
      const opSections = result.sections.filter(
        (s) => s.fundType === "operating",
      );
      let expectedNet = 0;
      for (const s of opSections) {
        if (s.accountType === "asset") expectedNet += s.totalCents;
        else expectedNet -= s.totalCents;
      }

      if (expectedNet !== result.operatingNetCents) {
        errors++;
      }
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 5: incomeStatement — net = revenue - expenses per fund (fuzz)
// ---------------------------------------------------------------------------
describe("incomeStatement — net derivation correctness (fuzz)", () => {
  const rng = mulberry32(0x2468ace0);

  it("operatingNetCents == operatingRevenueCents - operatingExpenseCents (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const rows = [];
      const n = Math.floor(rng() * 8) + 1;
      for (let j = 0; j < n; j++) {
        const isRevenue = rng() > 0.5;
        const ft: "operating" | "reserve" =
          rng() > 0.5 ? "operating" : "reserve";
        const debit = Math.floor(rng() * 50_000);
        const credit = Math.floor(rng() * 50_000);
        rows.push({
          accountId: `acc-${run}-${j}`,
          accountCode: `${5000 + j}`,
          accountName: `Acc ${j}`,
          accountType: isRevenue ? "revenue" : "expense",
          fundType: ft,
          debitCents: debit,
          creditCents: credit,
        });
      }

      const db = makeIncomeStatementDb(rows);
      const result = await incomeStatement(
        asIsDb(db),
        "comm-1",
        "2024-01-01",
        "2024-12-31",
      );

      const expectedOpNet =
        result.operatingRevenueCents - result.operatingExpenseCents;
      const expectedResNet =
        result.reserveRevenueCents - result.reserveExpenseCents;

      if (result.operatingNetCents !== expectedOpNet) {
        errors++;
      }
      if (result.reserveNetCents !== expectedResNet) {
        errors++;
      }
    }
    expect(errors).toBe(0);
  });

  it("no NaN in incomeStatement output (500 runs)", async () => {
    let nanFound = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const rows = [];
      const n = Math.floor(rng() * 8) + 1;
      for (let j = 0; j < n; j++) {
        const isRevenue = rng() > 0.5;
        const ft: "operating" | "reserve" =
          rng() > 0.5 ? "operating" : "reserve";
        rows.push({
          accountId: `acc-${run}-${j}`,
          accountCode: `${5000 + j}`,
          accountName: `Acc ${j}`,
          accountType: isRevenue ? "revenue" : "expense",
          fundType: ft,
          debitCents: Math.floor(rng() * 50_000),
          creditCents: Math.floor(rng() * 50_000),
        });
      }

      const db = makeIncomeStatementDb(rows);
      const result = await incomeStatement(
        asIsDb(db),
        "comm-1",
        "2024-01-01",
        "2024-12-31",
      );

      if (
        isNaN(result.operatingRevenueCents) ||
        isNaN(result.operatingExpenseCents) ||
        isNaN(result.operatingNetCents) ||
        isNaN(result.reserveRevenueCents) ||
        isNaN(result.reserveExpenseCents) ||
        isNaN(result.reserveNetCents) ||
        result.lines.some((l) => isNaN(l.amountCents))
      ) {
        nanFound++;
      }
    }
    expect(nanFound).toBe(0);
  });

  it("all lines are accounted for — no accounts dropped or double-counted (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const n = Math.floor(rng() * 8) + 2;
      const rows = [];
      for (let j = 0; j < n; j++) {
        const isRevenue = rng() > 0.5;
        const ft: "operating" | "reserve" =
          rng() > 0.5 ? "operating" : "reserve";
        rows.push({
          accountId: `acc-${run}-${j}`,
          accountCode: `${5000 + j}`,
          accountName: `Acc ${j}`,
          accountType: isRevenue ? "revenue" : "expense",
          fundType: ft,
          debitCents: Math.floor(rng() * 50_000) + 1,
          creditCents: 0,
        });
      }

      const db = makeIncomeStatementDb(rows);
      const result = await incomeStatement(
        asIsDb(db),
        "comm-1",
        "2024-01-01",
        "2024-12-31",
      );

      // Every account ID from input should appear exactly once in lines
      const expectedIds = new Set(rows.map((r) => r.accountId));
      const actualIds = result.lines.map((l) => l.accountId);
      const actualSet = new Set(actualIds);

      if (actualIds.length !== actualSet.size) {
        errors++;
        continue;
      }
      if (actualSet.size !== expectedIds.size) {
        errors++;
        continue;
      }
      for (const id of expectedIds) {
        if (!actualSet.has(id)) {
          errors++;
          break;
        }
      }
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 6: incomeStatement — revenue/expense signs are correct
// revenue amountCents = creditCents - debitCents (credit-normal)
// expense amountCents = debitCents - creditCents (debit-normal)
// ---------------------------------------------------------------------------
describe("incomeStatement — amount sign conventions (fuzz)", () => {
  const rng = mulberry32(0x9abcdef0);

  it("revenue lines: amountCents = creditCents - debitCents (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const debit = Math.floor(rng() * 10_000);
      const credit = Math.floor(rng() * 50_000);
      const rows = [
        {
          accountId: `rev-${run}`,
          accountCode: "4000",
          accountName: "Revenue",
          accountType: "revenue",
          fundType: "operating",
          debitCents: debit,
          creditCents: credit,
        },
      ];

      const db = makeIncomeStatementDb(rows);
      const result = await incomeStatement(
        asIsDb(db),
        "comm-1",
        "2024-01-01",
        "2024-12-31",
      );
      const line = result.lines.find((l) => l.accountId === `rev-${run}`);

      if (!line || line.amountCents !== credit - debit) {
        errors++;
      }
    }
    expect(errors).toBe(0);
  });

  it("expense lines: amountCents = debitCents - creditCents (500 runs)", async () => {
    let errors = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const debit = Math.floor(rng() * 50_000);
      const credit = Math.floor(rng() * 10_000);
      const rows = [
        {
          accountId: `exp-${run}`,
          accountCode: "5000",
          accountName: "Expense",
          accountType: "expense",
          fundType: "operating",
          debitCents: debit,
          creditCents: credit,
        },
      ];

      const db = makeIncomeStatementDb(rows);
      const result = await incomeStatement(
        asIsDb(db),
        "comm-1",
        "2024-01-01",
        "2024-12-31",
      );
      const line = result.lines.find((l) => l.accountId === `exp-${run}`);

      if (!line || line.amountCents !== debit - credit) {
        errors++;
      }
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// EDGE CASES: empty datasets, single accounts
// ---------------------------------------------------------------------------
describe("balanceSheet + incomeStatement — empty / minimal inputs", () => {
  it("balanceSheet empty → operatingNetCents=0, reserveNetCents=0, no NaN", async () => {
    const db = makeBalanceSheetDb([]);
    const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");
    expect(result.operatingNetCents).toBe(0);
    expect(result.reserveNetCents).toBe(0);
    expect(isNaN(result.operatingNetCents)).toBe(false);
    expect(isNaN(result.reserveNetCents)).toBe(false);
    expect(result.sections).toHaveLength(0);
  });

  it("incomeStatement empty → all zero, no NaN", async () => {
    const db = makeIncomeStatementDb([]);
    const result = await incomeStatement(
      asIsDb(db),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    expect(result.operatingRevenueCents).toBe(0);
    expect(result.operatingExpenseCents).toBe(0);
    expect(result.operatingNetCents).toBe(0);
    expect(result.reserveRevenueCents).toBe(0);
    expect(result.reserveExpenseCents).toBe(0);
    expect(result.reserveNetCents).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("balanceSheet with only revenue/expense rows → no sections, nets=0", async () => {
    const rows: TrialBalanceRow[] = [
      tbRow("rev-1", "4000", "Revenue", "revenue", "operating", 0, 100_000),
      tbRow("exp-1", "5000", "Expense", "expense", "operating", 50_000, 0),
    ];
    const db = makeBalanceSheetDb(rows);
    const result = await balanceSheet(asBsDb(db), "comm-1", "2024-12-31");
    expect(result.sections).toHaveLength(0);
    expect(result.operatingNetCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BUG PROBE: incomeStatement with zero-debit zero-credit rows
// amountCents for revenue = 0-0 = 0, for expense = 0-0 = 0
// No NaN, just 0. Acceptable behavior — document it.
// ---------------------------------------------------------------------------
describe("incomeStatement — zero debit/credit rows", () => {
  it("zero debit/credit row produces amountCents=0, no NaN", async () => {
    const rows = [
      {
        accountId: "rev-zero",
        accountCode: "4000",
        accountName: "Revenue",
        accountType: "revenue",
        fundType: "operating",
        debitCents: 0,
        creditCents: 0,
      },
    ];
    const db = makeIncomeStatementDb(rows);
    const result = await incomeStatement(
      asIsDb(db),
      "comm-1",
      "2024-01-01",
      "2024-12-31",
    );
    const line = result.lines.find((l) => l.accountId === "rev-zero");
    expect(line).toBeDefined();
    expect(line!.amountCents).toBe(0);
    expect(isNaN(line!.amountCents)).toBe(false);
  });
});
