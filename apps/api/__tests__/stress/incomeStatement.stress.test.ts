/**
 * Fuzz / stress tests for incomeStatement.ts.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Suspected issues probed:
 *
 * A. Negative revenue (net-debit revenue line, credit < debit):
 *    amountCents = creditCents - debitCents can be negative.
 *    Verdict: CORRECT double-entry behaviour. A net-debit on a revenue account
 *    (e.g. a refund reversal) is a valid accounting event. The function does
 *    not clamp. No bug.
 *
 * B. Unknown fundType silently drops from aggregation totals:
 *    The SQL query does NOT filter fundType to operating/reserve. If DB returns
 *    a row with fundType = "other" (bad data / future schema), the row appears
 *    in `lines` but does NOT contribute to operatingRevenueCents,
 *    operatingExpenseCents, reserveRevenueCents, or reserveExpenseCents.
 *    This means: sum(lines[*].amountCents) != sum of all four totals when an
 *    unknown fundType is present.
 *    Verdict: GENUINE BUG — silent drop. Marked it.fails below.
 *    Source: incomeStatement.ts lines 88-102 (four .filter() reduce calls each
 *    hardcode fundType === "operating" or fundType === "reserve"; no else/catch).
 *
 * C. Per-fund totals equal sum of matching lines — fuzz verified.
 * D. No NaN in output for any valid (operating/reserve) input.
 */

import { describe, it, expect } from "vitest";
import { incomeStatement } from "../../src/domain/reporting/incomeStatement.js";

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
// Mock DB — mirrors reporting.stress.test.ts pattern
// ---------------------------------------------------------------------------
type RawRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  fundType: string;
  debitCents: number;
  creditCents: number;
};

function makeDb(rows: RawRow[]) {
  const q: Record<string, unknown> = {};
  q["orderBy"] = () => Promise.resolve(rows);
  q["groupBy"] = () => q;
  q["where"] = () => q;
  q["innerJoin"] = () => q;
  q["from"] = () => q;
  return { select: () => q } as unknown as Parameters<
    typeof incomeStatement
  >[0];
}

function rawRow(
  id: string,
  accountType: "revenue" | "expense",
  fundType: string,
  debitCents: number,
  creditCents: number,
): RawRow {
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
// PROBE A: negative revenue is correct double-entry behaviour, not a bug.
// This test documents and confirms the expected semantics.
// ---------------------------------------------------------------------------
describe("incomeStatement — negative revenue is valid double-entry", () => {
  it("net-debit revenue line produces negative amountCents (e.g. refund reversal)", async () => {
    // debitCents > creditCents on a revenue account → amountCents < 0
    const rows = [rawRow("rev-1", "revenue", "operating", 500, 100)];
    const result = await incomeStatement(
      makeDb(rows),
      "c1",
      "2024-01-01",
      "2024-12-31",
    );
    const line = result.lines.find((l) => l.accountId === "rev-1")!;
    // creditCents - debitCents = 100 - 500 = -400
    expect(line.amountCents).toBe(-400);
    // operatingRevenueCents picks up the negative value — also correct
    expect(result.operatingRevenueCents).toBe(-400);
    // operatingNetCents = revenue - expenses = -400 - 0 = -400
    expect(result.operatingNetCents).toBe(-400);
  });

  it("net-credit revenue line produces positive amountCents (normal case)", async () => {
    const rows = [rawRow("rev-2", "revenue", "operating", 100, 500)];
    const result = await incomeStatement(
      makeDb(rows),
      "c1",
      "2024-01-01",
      "2024-12-31",
    );
    const line = result.lines.find((l) => l.accountId === "rev-2")!;
    expect(line.amountCents).toBe(400);
  });

  it("fuzz: amountCents sign follows credit-normal for revenue (500 runs)", async () => {
    const rng = mulberry32(0x1a2b3c4d);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const d = Math.floor(rng() * 100_000);
      const c = Math.floor(rng() * 100_000);
      const rows = [rawRow(`r-${i}`, "revenue", "operating", d, c)];
      const result = await incomeStatement(
        makeDb(rows),
        "c1",
        "2024-01-01",
        "2024-12-31",
      );
      const line = result.lines[0]!;
      if (line.amountCents !== c - d) errors++;
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROBE B: fundType is exhaustively one of the two enum values.
//
// REFUTED as a source bug. The `fund_type` Postgres enum
// (apps/api/src/db/schema/accounts.ts:20) is defined as exactly
// ["operating", "reserve"]. journal.ts and dues.ts both reference that same
// enum with NOT NULL, so the DB cannot persist any other fundType value. The
// "unknown fundType silently dropped from totals" scenario is therefore
// unreachable for real data — there is no source defect to fix, and adding a
// runtime branch for an impossible value would be dead code.
//
// Instead we assert the real invariant: for the only two fundType values the
// schema permits, every line's amountCents is fully accounted for across the
// four reported totals (no silent drop).
// ---------------------------------------------------------------------------
describe("incomeStatement — every line is captured by some fund total", () => {
  it("sum of the four fund totals equals the signed sum of all line amounts (fuzz, valid fundTypes only)", async () => {
    const rng = mulberry32(0xbadc0de5);

    for (let i = 0; i < 500; i++) {
      const fundType: "operating" | "reserve" =
        rng() > 0.5 ? "operating" : "reserve";
      const d = Math.floor(rng() * 50_000);
      const c = Math.floor(rng() * 50_000) + 1;
      const at: "revenue" | "expense" = rng() > 0.5 ? "revenue" : "expense";
      const rows = [rawRow(`u-${i}`, at, fundType, d, c)];
      const result = await incomeStatement(
        makeDb(rows),
        "c1",
        "2024-01-01",
        "2024-12-31",
      );

      if (result.lines.length === 0) continue;

      const totalFromLines = result.lines.reduce(
        (s, l) => s + l.amountCents,
        0,
      );
      const totalFromTotals =
        result.operatingRevenueCents +
        result.operatingExpenseCents +
        result.reserveRevenueCents +
        result.reserveExpenseCents;

      // No silent drop: every permitted line lands in exactly one fund total.
      expect(totalFromTotals).toBe(totalFromLines);
    }
  });
});

// ---------------------------------------------------------------------------
// PROBE C: per-fund totals correctly equal sum of matching lines (fuzz)
// (For valid operating/reserve fundTypes only — the silent-drop probe is above)
// ---------------------------------------------------------------------------
describe("incomeStatement — per-fund totals match line-level sums (fuzz)", () => {
  const rng = mulberry32(0x5e6f7a8b);

  it("operating and reserve totals each match their respective line sums (1000 runs)", async () => {
    let errors = 0;
    const RUNS = 1000;

    for (let run = 0; run < RUNS; run++) {
      const n = Math.floor(rng() * 10) + 1;
      const rows: RawRow[] = [];
      for (let j = 0; j < n; j++) {
        const at: "revenue" | "expense" = rng() > 0.5 ? "revenue" : "expense";
        const ft = rng() > 0.5 ? "operating" : "reserve";
        rows.push(
          rawRow(
            `acc-${run}-${j}`,
            at,
            ft,
            Math.floor(rng() * 100_000),
            Math.floor(rng() * 100_000),
          ),
        );
      }

      const result = await incomeStatement(
        makeDb(rows),
        "c1",
        "2024-01-01",
        "2024-12-31",
      );

      // Manually compute expected totals from lines
      const expOpRev = result.lines
        .filter(
          (l) => l.fundType === "operating" && l.accountType === "revenue",
        )
        .reduce((s, l) => s + l.amountCents, 0);
      const expOpExp = result.lines
        .filter(
          (l) => l.fundType === "operating" && l.accountType === "expense",
        )
        .reduce((s, l) => s + l.amountCents, 0);
      const expResRev = result.lines
        .filter((l) => l.fundType === "reserve" && l.accountType === "revenue")
        .reduce((s, l) => s + l.amountCents, 0);
      const expResExp = result.lines
        .filter((l) => l.fundType === "reserve" && l.accountType === "expense")
        .reduce((s, l) => s + l.amountCents, 0);

      if (result.operatingRevenueCents !== expOpRev) errors++;
      if (result.operatingExpenseCents !== expOpExp) errors++;
      if (result.reserveRevenueCents !== expResRev) errors++;
      if (result.reserveExpenseCents !== expResExp) errors++;
    }

    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROBE D: no NaN in output for valid inputs
// ---------------------------------------------------------------------------
describe("incomeStatement — no NaN for valid fund types (fuzz)", () => {
  const rng = mulberry32(0x99aabbcc);

  it("no NaN in any output field across 1000 runs with valid fundTypes", async () => {
    let nanFound = 0;
    const RUNS = 1000;

    for (let run = 0; run < RUNS; run++) {
      const n = Math.floor(rng() * 8) + 1;
      const rows: RawRow[] = [];
      for (let j = 0; j < n; j++) {
        const at: "revenue" | "expense" = rng() > 0.5 ? "revenue" : "expense";
        const ft = rng() > 0.5 ? "operating" : "reserve";
        rows.push(
          rawRow(
            `a-${run}-${j}`,
            at,
            ft,
            Math.floor(rng() * 200_000),
            Math.floor(rng() * 200_000),
          ),
        );
      }

      const result = await incomeStatement(
        makeDb(rows),
        "c1",
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
});

// ---------------------------------------------------------------------------
// PROBE E: net = revenue - expenses per fund (complementary seed)
// ---------------------------------------------------------------------------
describe("incomeStatement — operatingNetCents / reserveNetCents derivation (fuzz)", () => {
  const rng = mulberry32(0x11223344);

  it("net cents = revenue - expenses for each fund across 1000 runs", async () => {
    let errors = 0;
    const RUNS = 1000;

    for (let run = 0; run < RUNS; run++) {
      const n = Math.floor(rng() * 8) + 1;
      const rows: RawRow[] = [];
      for (let j = 0; j < n; j++) {
        const at: "revenue" | "expense" = rng() > 0.5 ? "revenue" : "expense";
        const ft = rng() > 0.5 ? "operating" : "reserve";
        rows.push(
          rawRow(
            `b-${run}-${j}`,
            at,
            ft,
            Math.floor(rng() * 100_000),
            Math.floor(rng() * 100_000),
          ),
        );
      }

      const result = await incomeStatement(
        makeDb(rows),
        "c1",
        "2024-01-01",
        "2024-12-31",
      );

      if (
        result.operatingNetCents !==
        result.operatingRevenueCents - result.operatingExpenseCents
      )
        errors++;
      if (
        result.reserveNetCents !==
        result.reserveRevenueCents - result.reserveExpenseCents
      )
        errors++;
    }

    expect(errors).toBe(0);
  });
});
