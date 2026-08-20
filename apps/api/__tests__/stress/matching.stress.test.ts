/**
 * Stress / adversarial fuzz tests for bankRec/matching domain logic.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Strategy:
 * - Seeded PRNG (mulberry32) for deterministic reproduction.
 * - Property assertions over large generated input sets.
 * - Concrete reproductions for suspected bugs (genuine bugs use it.fails).
 */

import { describe, it, expect } from "vitest";
import {
  findCandidates,
  type MatchCandidate,
} from "../../src/domain/bankRec/matching.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32 (same house style as postEntry.stress.test.ts)
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
// Helpers
// ---------------------------------------------------------------------------
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const ms = Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
  );
  const result = new Date(ms + days * 24 * 60 * 60 * 1000);
  return isoDate(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}

// ---------------------------------------------------------------------------
// PROPERTY 1: exact-day match always included
// ---------------------------------------------------------------------------
describe("findCandidates — exact-day match", () => {
  it("payment on same date and same amount is always a candidate (fuzz 500 runs)", () => {
    const rng = mulberry32(0xdeadbeef);
    for (let i = 0; i < 500; i++) {
      const year = 2020 + Math.floor(rng() * 5);
      const month = Math.floor(rng() * 12) + 1;
      const day = Math.floor(rng() * 28) + 1;
      const date = isoDate(year, month, day);
      const amount = Math.floor(rng() * 100_000) + 1;
      const payment: MatchCandidate = {
        paymentId: `p-${i}`,
        receivedAt: date,
        amountCents: amount,
      };
      const result = findCandidates(
        { id: `s-${i}`, postedDate: date, amountCents: -amount },
        [payment],
      );
      expect(result.candidates).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 2: payments exactly 4 days out are NEVER candidates
// ---------------------------------------------------------------------------
describe("findCandidates — 4-day offset is excluded", () => {
  it("payment 4 days after statement date is never a candidate (fuzz 200 runs)", () => {
    const rng = mulberry32(0xabcdef01);
    for (let i = 0; i < 200; i++) {
      const date = isoDate(2023, 6, 10 + (Math.floor(rng() * 15) + 1));
      const later = addDays(date, 4);
      const amount = Math.floor(rng() * 50_000) + 1;
      const payment: MatchCandidate = {
        paymentId: `p-${i}`,
        receivedAt: later,
        amountCents: amount,
      };
      const result = findCandidates(
        { id: `s-${i}`, postedDate: date, amountCents: -amount },
        [payment],
      );
      expect(result.candidates).toHaveLength(0);
    }
  });

  it("payment 4 days before statement date is never a candidate (fuzz 200 runs)", () => {
    const rng = mulberry32(0x11223344);
    for (let i = 0; i < 200; i++) {
      const date = isoDate(2023, 6, 15 + (Math.floor(rng() * 10) + 1));
      const earlier = addDays(date, -4);
      const amount = Math.floor(rng() * 50_000) + 1;
      const payment: MatchCandidate = {
        paymentId: `p-${i}`,
        receivedAt: earlier,
        amountCents: amount,
      };
      const result = findCandidates(
        { id: `s-${i}`, postedDate: date, amountCents: -amount },
        [payment],
      );
      expect(result.candidates).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 3: payments within ±3 days AND same amount ARE candidates
// ---------------------------------------------------------------------------
describe("findCandidates — ±3-day window", () => {
  it("payments at -3, -2, -1, 0, +1, +2, +3 days are all candidates", () => {
    const baseDate = "2024-03-15";
    const amount = 5000;
    const offsets = [-3, -2, -1, 0, 1, 2, 3];
    const payments: MatchCandidate[] = offsets.map((d) => ({
      paymentId: `p${d}`,
      receivedAt: addDays(baseDate, d),
      amountCents: amount,
    }));
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      payments,
    );
    expect(result.candidates).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4: toUtcDayMs with malformed/short date strings
//
// toUtcDayMs slices dateStr to first 10 chars and parses year/month/day.
// For malformed inputs:
//   ""        → parseInt("",10) = NaN → Date.UTC(NaN,...) = NaN
//   "20"      → year=20, month=NaN, day=NaN → Date.UTC(20,NaN,NaN) = NaN
//   "abc"     → year=NaN → NaN
//   "2024"    → year=2024, month=NaN → NaN
//
// When paymentDayMs = NaN:
//   diffDays = Math.abs(NaN - validMs) / MS_PER_DAY = NaN
//   NaN <= 3 → false → payment is EXCLUDED from candidates
//
// So malformed dates are safely rejected (not matched). This is NOT a bug.
// These tests confirm/document that safe behavior.
// ---------------------------------------------------------------------------
describe("findCandidates — malformed receivedAt date handling", () => {
  const baseDate = "2024-06-01";
  const amount = 10000;

  it("empty string receivedAt does not produce false match", () => {
    const payment: MatchCandidate = {
      paymentId: "p1",
      receivedAt: "",
      amountCents: amount,
    };
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      [payment],
    );
    // NaN <= 3 is false → excluded
    expect(result.candidates).toHaveLength(0);
  });

  it("too-short date string (4 chars) does not produce false match", () => {
    const payment: MatchCandidate = {
      paymentId: "p1",
      receivedAt: "2024",
      amountCents: amount,
    };
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      [payment],
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("gibberish date string does not produce false match", () => {
    const payment: MatchCandidate = {
      paymentId: "p1",
      receivedAt: "not-a-date",
      amountCents: amount,
    };
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      [payment],
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("ISO datetime string (with time) is correctly normalised to day bucket", () => {
    // "2024-06-01T23:59:59Z" should match "2024-06-01" (same day)
    const payment: MatchCandidate = {
      paymentId: "p1",
      receivedAt: "2024-06-01T23:59:59Z",
      amountCents: amount,
    };
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      [payment],
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("fuzz: 100 random malformed date strings never match a valid statement date", () => {
    const rng = mulberry32(0xba1da7e0);
    const malformed = [
      "",
      "2024",
      "20",
      "abc",
      "!@#$",
      "00000000",
      "99-99-99",
      "2024-13-01", // invalid month — Date.UTC may handle as overflow
    ];
    for (let i = 0; i < 100; i++) {
      const idx = Math.floor(rng() * malformed.length);
      const dateStr = malformed[idx] as string;
      const amt = Math.floor(rng() * 100_000) + 1;
      const payment: MatchCandidate = {
        paymentId: `p${i}`,
        receivedAt: dateStr,
        amountCents: amt,
      };
      const result = findCandidates(
        { id: `s${i}`, postedDate: baseDate, amountCents: -amt },
        [payment],
      );
      // Either 0 (NaN date) or could be 1 if date happens to overflow into range.
      // For the truly malformed ones (empty, "2024", "abc") it must be 0.
      if (
        dateStr === "" ||
        dateStr === "2024" ||
        dateStr === "20" ||
        dateStr === "abc" ||
        dateStr === "!@#$" ||
        dateStr === "00000000" ||
        dateStr === "99-99-99"
      ) {
        expect(result.candidates).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 5: amount matching — absolute value comparison
// ---------------------------------------------------------------------------
describe("findCandidates — amount matching (absolute values)", () => {
  it("statement with negative amountCents matches payment with positive amountCents", () => {
    const amount = 7500;
    const result = findCandidates(
      { id: "s1", postedDate: "2024-01-10", amountCents: -amount },
      [{ paymentId: "p1", receivedAt: "2024-01-10", amountCents: amount }],
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("statement with positive amountCents matches payment with positive amountCents", () => {
    const amount = 7500;
    const result = findCandidates(
      { id: "s1", postedDate: "2024-01-10", amountCents: amount },
      [{ paymentId: "p1", receivedAt: "2024-01-10", amountCents: amount }],
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("wrong amount does not match even on same date (fuzz 300 runs)", () => {
    const rng = mulberry32(0x55443322);
    for (let i = 0; i < 300; i++) {
      const statAmt = Math.floor(rng() * 100_000) + 2;
      // Ensure paymentAmt != statAmt by adding a non-zero offset
      const offset = Math.floor(rng() * (statAmt - 1)) + 1;
      const payAmt = statAmt - offset; // always less than statAmt, never equal
      const result = findCandidates(
        { id: `s${i}`, postedDate: "2024-06-15", amountCents: -statAmt },
        [{ paymentId: `p${i}`, receivedAt: "2024-06-15", amountCents: payAmt }],
      );
      expect(result.candidates).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 6: result fields are correctly populated
// ---------------------------------------------------------------------------
describe("findCandidates — result structure", () => {
  it("result carries correct statementLineId and amounts", () => {
    const result = findCandidates(
      { id: "stmt-abc", postedDate: "2024-05-20", amountCents: -25000 },
      [{ paymentId: "pay-xyz", receivedAt: "2024-05-21", amountCents: 25000 }],
    );
    expect(result.statementLineId).toBe("stmt-abc");
    expect(result.statementAmountCents).toBe(-25000);
    expect(result.statementPostedDate).toBe("2024-05-20");
    expect(result.candidates[0]?.paymentId).toBe("pay-xyz");
  });

  it("empty payments list yields empty candidates", () => {
    const result = findCandidates(
      { id: "s1", postedDate: "2024-01-01", amountCents: -10000 },
      [],
    );
    expect(result.candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 7: fuzz — no false positives from unrelated payments
// ---------------------------------------------------------------------------
describe("findCandidates — fuzz no false positives", () => {
  const rng = mulberry32(0xfeedf00d);

  it("payments outside ±3-day window never appear in candidates (500 runs)", () => {
    for (let i = 0; i < 500; i++) {
      const offset = Math.floor(rng() * 100) + 4; // always >= 4
      const sign = rng() > 0.5 ? 1 : -1;
      const baseDate = "2024-06-15";
      const payDate = addDays(baseDate, sign * offset);
      const amount = Math.floor(rng() * 100_000) + 1;
      const result = findCandidates(
        { id: `s${i}`, postedDate: baseDate, amountCents: -amount },
        [{ paymentId: `p${i}`, receivedAt: payDate, amountCents: amount }],
      );
      expect(result.candidates).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 8: multiple candidates — all in-window same-amount payments returned
// ---------------------------------------------------------------------------
describe("findCandidates — multiple candidates", () => {
  it("all in-window same-amount payments are returned", () => {
    const baseDate = "2024-08-10";
    const amount = 3333;
    // 5 in-window, 2 out-of-window (±4 days)
    const payments: MatchCandidate[] = [
      { paymentId: "in-m3", receivedAt: addDays(baseDate, -3), amountCents: amount },
      { paymentId: "in-m1", receivedAt: addDays(baseDate, -1), amountCents: amount },
      { paymentId: "in-0",  receivedAt: baseDate,              amountCents: amount },
      { paymentId: "in-p2", receivedAt: addDays(baseDate, 2),  amountCents: amount },
      { paymentId: "in-p3", receivedAt: addDays(baseDate, 3),  amountCents: amount },
      { paymentId: "out-m4",receivedAt: addDays(baseDate, -4), amountCents: amount },
      { paymentId: "out-p4",receivedAt: addDays(baseDate, 4),  amountCents: amount },
    ];
    const result = findCandidates(
      { id: "s1", postedDate: baseDate, amountCents: -amount },
      payments,
    );
    expect(result.candidates).toHaveLength(5);
    const ids = result.candidates.map((c) => c.paymentId).sort();
    expect(ids).toEqual(["in-0", "in-m1", "in-m3", "in-p2", "in-p3"].sort());
  });
});
