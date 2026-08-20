/**
 * Fuzz / stress tests for balanceSheet.ts — computeBalance and fundNet logic.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Suspected issues probed:
 * A. computeBalance with unknown accountType silently uses credit-normal logic.
 *    → The function is typed to only accept known types; unknown values can only
 *      arrive via DB corruption / unsafe cast. We probe whether the runtime
 *      behaviour is a silent misclassification that violates the accounting
 *      equation, and flag it with it.fails if so.
 * B. fundNet sign: assets add, liabilities+equity subtract. Verified via fuzz.
 * C. No NaN / Infinity in any output (handled in reporting.stress.test.ts;
 *    we add targeted boundary probes here: extreme values, zero).
 *
 * Convention: it.fails marks a genuine source bug (file:line, input, expected
 * vs actual). Tests that pass document correct behavior.
 */

import { describe, it, expect } from "vitest";
import { balanceSheet } from "../../src/domain/reporting/balanceSheet.js";
import type { TrialBalanceRow } from "@boardstack/shared";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32 (same implementation used across stress suite)
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
// Mock DB — mirrors reporting.stress.test.ts pattern
// ---------------------------------------------------------------------------
function makeDb(rows: TrialBalanceRow[]) {
  const q: Record<string, unknown> = {};
  q["orderBy"] = () => Promise.resolve(rows);
  q["groupBy"] = () => q;
  q["where"] = () => q;
  q["innerJoin"] = () => q;
  q["from"] = () => q;
  return { select: () => q } as unknown as Parameters<typeof balanceSheet>[0];
}

function row(
  id: string,
  accountType: TrialBalanceRow["accountType"],
  fundType: "operating" | "reserve",
  debitCents: number,
  creditCents: number,
): TrialBalanceRow {
  return {
    accountId: id,
    accountCode: id,
    accountName: id,
    accountType,
    fundType,
    debitCents,
    creditCents,
  };
}

// ---------------------------------------------------------------------------
// PROBE A: unknown accountType is silently misclassified as credit-normal.
//
// Source: balanceSheet.ts line 46 filters with BALANCE_SHEET_TYPES.has(r.accountType)
// BEFORE computeBalance is called.  An unknown accountType ("bogus") is dropped
// by the filter and never reaches computeBalance.
//
// Verdict: NOT a bug at the balanceSheet() level.  The BALANCE_SHEET_TYPES
// filter on line 46 guards computeBalance from unknown types.  The unknown-type
// account is silently dropped from the balance sheet (treated as a non-BS
// account like revenue/expense), which is the correct behaviour — it does NOT
// silently misclassify inside computeBalance.
//
// This test asserts the correct observable behaviour: unknown-type rows do not
// appear in sections and do not affect fund net totals.
// ---------------------------------------------------------------------------
describe("balanceSheet — unknown accountType is filtered out, not misclassified", () => {
  it("row with unknown accountType is excluded from sections and net totals", async () => {
    // A known-good asset row and an unknown-type row in the same fund.
    // The asset debit = 1000, credit = 0 → balanceCents = 1000.
    // The unknown row has debit = 5000, credit = 0 — if it were silently
    // credit-normal it would produce balanceCents = -5000.
    const rows = [
      row("asset-1", "asset", "operating", 1000, 0),
      // Cast to bypass TypeScript to simulate DB corruption / unsafe cast
      {
        accountId: "bogus-1",
        accountCode: "bogus-1",
        accountName: "bogus",
        accountType: "bogus" as TrialBalanceRow["accountType"],
        fundType: "operating" as const,
        debitCents: 5000,
        creditCents: 0,
      } satisfies TrialBalanceRow,
    ];

    const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");

    // The bogus row must not appear in any section
    const allAccountIds = result.sections.flatMap((s) =>
      s.accounts.map((a) => a.accountId),
    );
    expect(allAccountIds).not.toContain("bogus-1");

    // operatingNetCents must reflect only the known asset row
    expect(result.operatingNetCents).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// PROBE B: accounting equation Assets = Liabilities + Equity per fund
// (complementary to reporting.stress.test.ts INVARIANT 3, uses different seeds
// and also tests the reserve fund path, and mixed-fund inputs)
// ---------------------------------------------------------------------------
describe("balanceSheet — accounting equation stress (mixed-fund, 1000 runs)", () => {
  const rng = mulberry32(0xdeadbeef);

  it("Assets == Liabilities + Equity per fund for balanced inputs (1000 runs)", async () => {
    let violated = 0;
    const RUNS = 1000;

    for (let run = 0; run < RUNS; run++) {
      // Build two independent balanced funds in one call
      const opLiab = Math.floor(rng() * 200_000);
      const opEquity = Math.floor(rng() * 200_000);
      const opAsset = opLiab + opEquity;

      const resLiab = Math.floor(rng() * 200_000);
      const resEquity = Math.floor(rng() * 200_000);
      const resAsset = resLiab + resEquity;

      const rows: TrialBalanceRow[] = [
        row(`op-a-${run}`, "asset", "operating", opAsset, 0),
        row(`op-l-${run}`, "liability", "operating", 0, opLiab),
        row(`op-e-${run}`, "equity", "operating", 0, opEquity),
        row(`res-a-${run}`, "asset", "reserve", resAsset, 0),
        row(`res-l-${run}`, "liability", "reserve", 0, resLiab),
        row(`res-e-${run}`, "equity", "reserve", 0, resEquity),
      ];

      const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");

      if (result.operatingNetCents !== 0) violated++;
      if (result.reserveNetCents !== 0) violated++;
    }

    expect(violated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROBE C: fundNet sign — assets add, liabilities and equity both subtract
// ---------------------------------------------------------------------------
describe("balanceSheet — fundNet sign correctness (targeted cases)", () => {
  it("pure asset fund: operatingNetCents = asset balance", async () => {
    const rows = [row("a1", "asset", "operating", 5000, 2000)];
    const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");
    // asset balanceCents = 5000 - 2000 = 3000; net = +3000
    expect(result.operatingNetCents).toBe(3000);
  });

  it("pure liability fund: operatingNetCents = -(liability balance)", async () => {
    const rows = [row("l1", "liability", "operating", 0, 8000)];
    const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");
    // liability balanceCents = 8000 - 0 = 8000; net = -8000
    expect(result.operatingNetCents).toBe(-8000);
  });

  it("pure equity fund: operatingNetCents = -(equity balance)", async () => {
    const rows = [row("e1", "equity", "operating", 1000, 4000)];
    const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");
    // equity balanceCents = 4000 - 1000 = 3000; net = -3000
    expect(result.operatingNetCents).toBe(-3000);
  });

  it("reserve fund is independent of operating fund", async () => {
    const rows = [
      row("op-a", "asset", "operating", 10000, 0),
      row("res-a", "asset", "reserve", 7500, 0),
    ];
    const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");
    expect(result.operatingNetCents).toBe(10000);
    expect(result.reserveNetCents).toBe(7500);
  });
});

// ---------------------------------------------------------------------------
// PROBE D: extreme integer values — no Infinity, no overflow surprise
// ---------------------------------------------------------------------------
describe("balanceSheet — extreme integer values", () => {
  const rng = mulberry32(0xcafef00d);

  it("very large cent values (up to 2^40) do not produce NaN or Infinity (200 runs)", async () => {
    let bad = 0;
    const RUNS = 200;

    for (let run = 0; run < RUNS; run++) {
      // Up to ~1 trillion cents ($10B) — well within JS safe integer range
      const scale = Math.pow(2, 30 + Math.floor(rng() * 10));
      const debit = Math.floor(rng() * scale);
      const credit = Math.floor(rng() * scale);
      const at = (["asset", "liability", "equity"] as const)[
        Math.floor(rng() * 3)
      ]!;
      const ft = rng() > 0.5 ? ("operating" as const) : ("reserve" as const);

      const result = await balanceSheet(
        makeDb([row(`x-${run}`, at, ft, debit, credit)]),
        "c1",
        "2024-12-31",
      );

      const net =
        ft === "operating"
          ? result.operatingNetCents
          : result.reserveNetCents;

      if (!isFinite(net) || isNaN(net)) bad++;
      for (const s of result.sections) {
        if (!isFinite(s.totalCents) || isNaN(s.totalCents)) bad++;
      }
    }

    expect(bad).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROBE E: revenue/expense rows fed to balanceSheet are always filtered out
// (BALANCE_SHEET_TYPES does not include revenue/expense)
// ---------------------------------------------------------------------------
describe("balanceSheet — revenue and expense rows are filtered before sections", () => {
  const rng = mulberry32(0x0feedbad);

  it("income-statement account types never appear in balance sheet sections (500 runs)", async () => {
    let contaminated = 0;
    const RUNS = 500;

    for (let run = 0; run < RUNS; run++) {
      const n = Math.floor(rng() * 6) + 1;
      const rows: TrialBalanceRow[] = [];
      for (let j = 0; j < n; j++) {
        const at = (["revenue", "expense"] as const)[
          Math.floor(rng() * 2)
        ] as TrialBalanceRow["accountType"];
        const ft = rng() > 0.5 ? ("operating" as const) : ("reserve" as const);
        rows.push(
          row(`inc-${run}-${j}`, at, ft, Math.floor(rng() * 10_000), 0),
        );
      }

      const result = await balanceSheet(makeDb(rows), "c1", "2024-12-31");

      if (result.sections.length > 0) contaminated++;
    }

    expect(contaminated).toBe(0);
  });
});
