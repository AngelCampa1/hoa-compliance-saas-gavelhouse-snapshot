/**
 * Stress / fuzz tests for bankRec domain modules.
 * Uses a hand-rolled mulberry32 PRNG — no extra npm deps.
 */

import { describe, it, expect } from "vitest";
import {
  findCandidates,
  type MatchCandidate,
} from "../../src/domain/bankRec/matching.js";
import { verifyBalance } from "../../src/domain/bankRec/reconciliation.js";

// ---------------------------------------------------------------------------
// Mulberry32 PRNG — returns floats in [0, 1)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function isoDate(baseMs: number, deltaDays: number): string {
  const d = new Date(baseMs + deltaDays * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const BASE_MS = Date.UTC(2024, 0, 15); // 2024-01-15

// ---------------------------------------------------------------------------
// findCandidates stress tests
// ---------------------------------------------------------------------------

describe("findCandidates – stress invariants", () => {
  const rng = mulberry32(0xdeadbeef);

  /**
   * Invariant A: result.candidates is always a subset of the input payments
   * (no phantom matches introduced).
   */
  it("A – candidate paymentIds always come from the supplied payments array", () => {
    for (let trial = 0; trial < 2_000; trial++) {
      const lineAmount = Math.floor(rng() * 100_000) + 1;
      const lineDate = isoDate(BASE_MS, Math.floor(rng() * 100) - 50);
      const n = Math.floor(rng() * 20);
      const payments: MatchCandidate[] = [];
      const paymentIds = new Set<string>();
      for (let i = 0; i < n; i++) {
        const id = `p-${trial}-${i}`;
        paymentIds.add(id);
        payments.push({
          paymentId: id,
          receivedAt: isoDate(BASE_MS, Math.floor(rng() * 100) - 50),
          amountCents: Math.floor(rng() * 100_000) + 1,
        });
      }
      const line = {
        id: `line-${trial}`,
        postedDate: lineDate,
        amountCents: lineAmount,
      };
      const result = findCandidates(line, payments);

      for (const c of result.candidates) {
        expect(paymentIds.has(c.paymentId)).toBe(true);
      }
    }
  });

  /**
   * Invariant B: result echoes the input line fields exactly.
   */
  it("B – result always echoes statementLineId, amountCents, and postedDate", () => {
    const rng2 = mulberry32(0xcafebabe);
    for (let trial = 0; trial < 1_000; trial++) {
      const id = `line-${trial}`;
      const amountCents = Math.floor(rng2() * 200_000) - 100_000;
      const postedDate = isoDate(BASE_MS, Math.floor(rng2() * 365) - 182);
      const result = findCandidates({ id, postedDate, amountCents }, []);

      expect(result.statementLineId).toBe(id);
      expect(result.statementAmountCents).toBe(amountCents);
      expect(result.statementPostedDate).toBe(postedDate);
    }
  });

  /**
   * Invariant C: every matched candidate must have |amountCents| === |lineAmountCents|.
   */
  it("C – every matched candidate has exact absolute amount match", () => {
    const rng3 = mulberry32(0x1337cafe);
    for (let trial = 0; trial < 2_000; trial++) {
      const lineAmount = Math.floor(rng3() * 50_000) + 1;
      const sign = rng3() < 0.5 ? 1 : -1;
      const lineDate = isoDate(BASE_MS, Math.floor(rng3() * 20) - 10);

      const n = Math.floor(rng3() * 15) + 1;
      const payments: MatchCandidate[] = [];
      for (let i = 0; i < n; i++) {
        payments.push({
          paymentId: `p-${trial}-${i}`,
          receivedAt: isoDate(BASE_MS, Math.floor(rng3() * 20) - 10),
          amountCents: Math.floor(rng3() * 50_000) + 1,
        });
      }
      const result = findCandidates(
        { id: `l-${trial}`, postedDate: lineDate, amountCents: sign * lineAmount },
        payments,
      );

      for (const c of result.candidates) {
        expect(Math.abs(c.amountCents)).toBe(lineAmount);
      }
    }
  });

  /**
   * Invariant D: every matched candidate must be within ±3 days of line.postedDate.
   */
  it("D – every matched candidate is within ±3 calendar days of the statement line", () => {
    const rng4 = mulberry32(0xfeedface);
    const MS_PER_DAY = 86_400_000;

    function toUtcDay(s: string): number {
      return Date.UTC(
        Number(s.slice(0, 4)),
        Number(s.slice(5, 7)) - 1,
        Number(s.slice(8, 10)),
      );
    }

    for (let trial = 0; trial < 2_000; trial++) {
      const lineAmt = Math.floor(rng4() * 80_000) + 1;
      const lineDate = isoDate(BASE_MS, Math.floor(rng4() * 100) - 50);
      const n = Math.floor(rng4() * 15) + 1;
      const payments: MatchCandidate[] = [];
      for (let i = 0; i < n; i++) {
        payments.push({
          paymentId: `p-${trial}-${i}`,
          receivedAt: isoDate(BASE_MS, Math.floor(rng4() * 20) - 10),
          amountCents: lineAmt,
        });
      }
      const result = findCandidates(
        { id: `l-${trial}`, postedDate: lineDate, amountCents: lineAmt },
        payments,
      );

      const lineDayMs = toUtcDay(lineDate);
      for (const c of result.candidates) {
        const payDayMs = toUtcDay(c.receivedAt.slice(0, 10));
        const diffDays = Math.abs(payDayMs - lineDayMs) / MS_PER_DAY;
        expect(diffDays).toBeLessThanOrEqual(3);
      }
    }
  });

  /**
   * Invariant E: findCandidates never throws for extreme / special numeric inputs;
   * returned candidates are always a subset of the input payment array.
   * NaN line amount means |NaN| !== |anything| → no candidates (NaN !== NaN).
   * Infinity amounts similarly produce 0 candidates for normal payment amounts.
   */
  it("E – findCandidates never throws for extreme / special line amounts", () => {
    const extremeAmounts = [0, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0.5, -0.5];
    const payments: MatchCandidate[] = [
      { paymentId: "p1", receivedAt: "2024-01-15", amountCents: 10000 },
      { paymentId: "p2", receivedAt: "2024-01-15", amountCents: 0 },
    ];
    const allPaymentIds = new Set(payments.map((p) => p.paymentId));

    for (const lineAmt of extremeAmounts) {
      expect(() =>
        findCandidates(
          { id: "l-extreme", postedDate: "2024-01-15", amountCents: lineAmt },
          payments,
        ),
      ).not.toThrow();

      const result = findCandidates(
        { id: "l-extreme", postedDate: "2024-01-15", amountCents: lineAmt },
        payments,
      );
      // Candidates must be a subset of input
      for (const c of result.candidates) {
        expect(allPaymentIds.has(c.paymentId)).toBe(true);
      }
    }
  });

  /**
   * Invariant F: zero-amount line — payments with zero amount can only match
   * zero-amount line (|0| === |0| → match). This also probes the 0-amount
   * boundary: a payment with amountCents=0 should NOT match a line with
   * amountCents != 0.
   */
  it("F – zero-amount payment does not match a non-zero line", () => {
    const result = findCandidates(
      { id: "l-zero", postedDate: "2024-01-15", amountCents: 100 },
      [{ paymentId: "p-zero", receivedAt: "2024-01-15", amountCents: 0 }],
    );
    expect(result.candidates).toHaveLength(0);
  });

  /**
   * Invariant G: duplicate payment ids in the input array should each appear
   * as a separate candidate (no deduplication by the matcher; that is the
   * caller's responsibility). Verify count equals expected duplicates.
   */
  it("G – duplicate paymentIds in input are each included as separate candidates", () => {
    const payments: MatchCandidate[] = [
      { paymentId: "dup", receivedAt: "2024-01-15", amountCents: 5000 },
      { paymentId: "dup", receivedAt: "2024-01-15", amountCents: 5000 },
      { paymentId: "dup", receivedAt: "2024-01-15", amountCents: 5000 },
    ];
    const result = findCandidates(
      { id: "l-dup", postedDate: "2024-01-15", amountCents: 5000 },
      payments,
    );
    // All three are valid candidates — the matcher does not enforce uniqueness
    expect(result.candidates).toHaveLength(3);
  });

  /**
   * Invariant H: large payment arrays (10 000 entries) — still correct subset.
   */
  it("H – correctly filters from a large (10 000) payment pool", () => {
    const rng5 = mulberry32(0xabcdef01);
    const payments: MatchCandidate[] = [];
    const lineAmt = 99_999;
    const lineDate = "2024-06-01";

    for (let i = 0; i < 10_000; i++) {
      const deltaDay = Math.floor(rng5() * 21) - 10; // -10..+10 days
      const amt = Math.floor(rng5() * 200_000);
      payments.push({
        paymentId: `p-${i}`,
        receivedAt: isoDate(Date.UTC(2024, 5, 1), deltaDay),
        amountCents: amt,
      });
    }

    const result = findCandidates(
      { id: "big-line", postedDate: lineDate, amountCents: lineAmt },
      payments,
    );

    // Every candidate must satisfy both predicates
    const MS_PER_DAY = 86_400_000;
    function toDay(s: string) {
      return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    }
    const lineDayMs = toDay(lineDate);
    for (const c of result.candidates) {
      const diff = Math.abs(toDay(c.receivedAt.slice(0, 10)) - lineDayMs) / MS_PER_DAY;
      expect(diff).toBeLessThanOrEqual(3);
      expect(Math.abs(c.amountCents)).toBe(lineAmt);
    }
  });

  /**
   * Invariant I: boundary exactly at ±3 days is INCLUDED; ±4 is EXCLUDED.
   * (This exercises the <= 3 boundary more exhaustively than the unit test.)
   */
  it("I – boundary day 3 included, day 4 excluded (many amounts)", () => {
    const rng6 = mulberry32(0x99887766);
    for (let trial = 0; trial < 500; trial++) {
      const amt = Math.floor(rng6() * 50_000) + 1;
      const baseDate = isoDate(BASE_MS, Math.floor(rng6() * 200) - 100);

      const minus3 = isoDate(
        Date.UTC(
          Number(baseDate.slice(0, 4)),
          Number(baseDate.slice(5, 7)) - 1,
          Number(baseDate.slice(8, 10)),
        ),
        -3,
      );
      const minus4 = isoDate(
        Date.UTC(
          Number(baseDate.slice(0, 4)),
          Number(baseDate.slice(5, 7)) - 1,
          Number(baseDate.slice(8, 10)),
        ),
        -4,
      );
      const plus3 = isoDate(
        Date.UTC(
          Number(baseDate.slice(0, 4)),
          Number(baseDate.slice(5, 7)) - 1,
          Number(baseDate.slice(8, 10)),
        ),
        3,
      );
      const plus4 = isoDate(
        Date.UTC(
          Number(baseDate.slice(0, 4)),
          Number(baseDate.slice(5, 7)) - 1,
          Number(baseDate.slice(8, 10)),
        ),
        4,
      );

      const r3neg = findCandidates(
        { id: "l", postedDate: baseDate, amountCents: amt },
        [{ paymentId: "p", receivedAt: minus3, amountCents: amt }],
      );
      expect(r3neg.candidates).toHaveLength(1);

      const r4neg = findCandidates(
        { id: "l", postedDate: baseDate, amountCents: amt },
        [{ paymentId: "p", receivedAt: minus4, amountCents: amt }],
      );
      expect(r4neg.candidates).toHaveLength(0);

      const r3pos = findCandidates(
        { id: "l", postedDate: baseDate, amountCents: amt },
        [{ paymentId: "p", receivedAt: plus3, amountCents: amt }],
      );
      expect(r3pos.candidates).toHaveLength(1);

      const r4pos = findCandidates(
        { id: "l", postedDate: baseDate, amountCents: amt },
        [{ paymentId: "p", receivedAt: plus4, amountCents: amt }],
      );
      expect(r4pos.candidates).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyBalance stress tests
// ---------------------------------------------------------------------------

describe("verifyBalance – stress invariants", () => {
  const rng = mulberry32(0x13571357);

  /**
   * Invariant A: deltaCents === matchedAmountCents - (ending - beginning) always.
   */
  it("A – deltaCents is always matchedAmountCents - (endingBalance - beginningBalance)", () => {
    for (let trial = 0; trial < 5_000; trial++) {
      const matched = Math.floor(rng() * 2_000_000) - 1_000_000;
      const beginning = Math.floor(rng() * 10_000_000);
      const ending = Math.floor(rng() * 10_000_000);

      const { deltaCents } = verifyBalance(matched, beginning, ending);
      const expected = matched - (ending - beginning);
      expect(deltaCents).toBe(expected);
    }
  });

  /**
   * Invariant B: balanced is true iff |deltaCents| <= 1.
   */
  it("B – balanced === (|deltaCents| <= 1) for randomised inputs", () => {
    const rng2 = mulberry32(0x24682468);
    for (let trial = 0; trial < 5_000; trial++) {
      const matched = Math.floor(rng2() * 2_000_000) - 1_000_000;
      const beginning = Math.floor(rng2() * 10_000_000);
      const ending = Math.floor(rng2() * 10_000_000);

      const { balanced, deltaCents } = verifyBalance(matched, beginning, ending);
      expect(balanced).toBe(Math.abs(deltaCents) <= 1);
    }
  });

  /**
   * Invariant C: exact equality always gives balanced=true and deltaCents=0.
   */
  it("C – exact balance always returns balanced=true, deltaCents=0", () => {
    const rng3 = mulberry32(0x99aabb);
    for (let trial = 0; trial < 2_000; trial++) {
      const beginning = Math.floor(rng3() * 10_000_000);
      const ending = Math.floor(rng3() * 10_000_000);
      const matched = ending - beginning;

      const result = verifyBalance(matched, beginning, ending);
      expect(result.balanced).toBe(true);
      expect(result.deltaCents).toBe(0);
    }
  });

  /**
   * Invariant D: no NaN for extreme integer inputs.
   */
  it("D – no NaN for extreme / boundary integer values", () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER],
      [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0],
      [0, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ];
    for (const [matched, begin, end] of cases) {
      const { balanced, deltaCents } = verifyBalance(matched, begin, end);
      expect(Number.isNaN(deltaCents)).toBe(false);
      expect(Number.isNaN(balanced)).toBe(false);
    }
  });

  /**
   * Invariant E: fractional cent inputs (float rounding edge cases).
   * deltaCents might be a float but balanced should still be deterministic.
   */
  it("E – fractional cent inputs produce deterministic balanced result", () => {
    const floatCases: [number, number, number][] = [
      [100.5, 0, 100],       // delta = 0.5 → |0.5| <= 1 → balanced
      [100.5, 0, 99],        // delta = 1.5 → not balanced
      [0.1 + 0.2, 0, 0.3],  // classic float imprecision
    ];
    for (const [matched, begin, end] of floatCases) {
      const { balanced, deltaCents } = verifyBalance(matched, begin, end);
      // Verify the definition holds for floats too
      expect(balanced).toBe(Math.abs(deltaCents) <= 1);
    }
  });
});
