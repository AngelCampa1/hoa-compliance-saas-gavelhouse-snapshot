/**
 * Fuzz / stress tests for reconciliation.ts — verifyBalance.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Suspected issues probed:
 *
 * A. NaN inputs — no guard in verifyBalance.
 *    Math.abs(NaN) <= 1 evaluates to false (NaN comparison is always false).
 *    So balanced = false and deltaCents = NaN when any input is NaN.
 *    The function does NOT throw — it silently returns { balanced: false, deltaCents: NaN }.
 *    Verdict: GENUINE BUG — silent NaN propagation. A NaN input should either
 *    throw or return a distinct error state, not a structurally valid-looking
 *    result with a poisoned deltaCents.
 *    Marked it.fails below.
 *    Source: reconciliation.ts lines 14-16 (no isNaN / Number.isFinite guard).
 *
 * B. deltaCents sign and magnitude: deltaCents = matchedAmount - (ending - beginning).
 *    Verified correct via exhaustive boundary tests around the ±1 tolerance.
 *
 * C. Tolerance boundary: balanced = true iff |deltaCents| <= 1.
 *    Exactly ±1 must be balanced = true; ±2 must be balanced = false.
 *
 * D. Non-integer (float) inputs: verifyBalance accepts numbers; floats flow
 *    through arithmetic without special handling. Tested for predictability.
 */

import { describe, it, expect } from "vitest";
import { verifyBalance } from "../../src/domain/bankRec/reconciliation.js";

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
// PROBE A: NaN inputs — silent NaN propagation is a bug.
//
// BUG: reconciliation.ts lines 14-16
// Reproducing inputs: verifyBalance(NaN, 0, 0)
// Expected: throw a RangeError / TypeError, OR return { balanced: false, deltaCents: NaN }
//           with deltaCents explicitly signalling an invalid state (e.g. deltaCents = NaN
//           is acceptable IFF callers consistently check for it — but there is no
//           contract documenting this, and the JSDoc says deltaCents is a number).
// Actual:   { balanced: false, deltaCents: NaN } — no throw, no guard, silent poison.
//
// The test below asserts that NaN input is rejected (throws or returns a
// clearly invalid sentinel). It.fails because the source has no guard.
// ---------------------------------------------------------------------------
describe("verifyBalance — NaN input handling (BUG)", () => {
  /**
   * BUG: reconciliation.ts lines 14-16
   * Reproducing input: verifyBalance(NaN, 0, 0)
   * Expected: throws, OR deltaCents is not NaN (some safe sentinel)
   * Actual:   { balanced: false, deltaCents: NaN } — structurally normal result
   *           with poisoned deltaCents; callers cannot distinguish from a real
   *           imbalance.
   */
  it("verifyBalance(NaN, 0, 0) throws instead of returning poisoned deltaCents", () => {
    expect(() => verifyBalance(NaN, 0, 0)).toThrow();
  });

  it("verifyBalance(0, NaN, 0) throws instead of returning poisoned deltaCents", () => {
    expect(() => verifyBalance(0, NaN, 0)).toThrow();
  });

  it("verifyBalance(0, 0, NaN) throws instead of returning poisoned deltaCents", () => {
    expect(() => verifyBalance(0, 0, NaN)).toThrow();
  });

  // Infinity is also non-finite and must be rejected the same way.
  it("non-finite (Infinity) inputs throw for every argument position", () => {
    expect(() => verifyBalance(Infinity, 0, 0)).toThrow();
    expect(() => verifyBalance(0, -Infinity, 0)).toThrow();
    expect(() => verifyBalance(0, 0, Infinity)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PROBE B: deltaCents sign and magnitude correctness
// deltaCents = matchedAmountCents - (endingBalanceCents - beginningBalanceCents)
// ---------------------------------------------------------------------------
describe("verifyBalance — deltaCents sign and magnitude", () => {
  it("deltaCents is positive when matchedAmount > net change", () => {
    // matched = 1000, expected net = 900 → delta = +100
    const { deltaCents, balanced } = verifyBalance(1000, 0, 900);
    expect(deltaCents).toBe(100);
    expect(balanced).toBe(false);
  });

  it("deltaCents is negative when matchedAmount < net change", () => {
    // matched = 800, expected net = 900 → delta = -100
    const { deltaCents, balanced } = verifyBalance(800, 0, 900);
    expect(deltaCents).toBe(-100);
    expect(balanced).toBe(false);
  });

  it("deltaCents is zero when matchedAmount equals net change", () => {
    const { deltaCents, balanced } = verifyBalance(500, 200, 700);
    expect(deltaCents).toBe(0);
    expect(balanced).toBe(true);
  });

  it("negative beginning balance: net change = ending - beginning (can be large positive)", () => {
    // beginning = -500, ending = 500 → expected net = 1000
    const { deltaCents, balanced } = verifyBalance(1000, -500, 500);
    expect(deltaCents).toBe(0);
    expect(balanced).toBe(true);
  });

  it("negative net change (ending < beginning): delta reflects sign correctly", () => {
    // matched = -300, beginning = 500, ending = 200 → expected net = -300 → delta = 0
    const { deltaCents, balanced } = verifyBalance(-300, 500, 200);
    expect(deltaCents).toBe(0);
    expect(balanced).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PROBE C: tolerance boundary — exactly ±1 cent
// ---------------------------------------------------------------------------
describe("verifyBalance — ±1 cent tolerance boundary (exhaustive)", () => {
  it("delta = 0 → balanced = true", () => {
    expect(verifyBalance(100, 0, 100).balanced).toBe(true);
  });

  it("delta = +1 → balanced = true (within tolerance)", () => {
    // matched = 101, expected net = 100 → delta = +1
    const r = verifyBalance(101, 0, 100);
    expect(r.deltaCents).toBe(1);
    expect(r.balanced).toBe(true);
  });

  it("delta = -1 → balanced = true (within tolerance)", () => {
    // matched = 99, expected net = 100 → delta = -1
    const r = verifyBalance(99, 0, 100);
    expect(r.deltaCents).toBe(-1);
    expect(r.balanced).toBe(true);
  });

  it("delta = +2 → balanced = false (exceeds tolerance)", () => {
    // matched = 102, expected net = 100 → delta = +2
    const r = verifyBalance(102, 0, 100);
    expect(r.deltaCents).toBe(2);
    expect(r.balanced).toBe(false);
  });

  it("delta = -2 → balanced = false (exceeds tolerance)", () => {
    // matched = 98, expected net = 100 → delta = -2
    const r = verifyBalance(98, 0, 100);
    expect(r.deltaCents).toBe(-2);
    expect(r.balanced).toBe(false);
  });

  it("delta = +1 at various base amounts (fuzz boundary)", () => {
    const rng = mulberry32(0xb0011da1);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const base = Math.floor(rng() * 1_000_000);
      const r = verifyBalance(base + 1, 0, base);
      if (!r.balanced || r.deltaCents !== 1) errors++;
    }
    expect(errors).toBe(0);
  });

  it("delta = -1 at various base amounts (fuzz boundary)", () => {
    const rng = mulberry32(0xb0011da2);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const base = Math.floor(rng() * 1_000_000);
      const r = verifyBalance(base - 1, 0, base);
      if (!r.balanced || r.deltaCents !== -1) errors++;
    }
    expect(errors).toBe(0);
  });

  it("delta = +2 at various base amounts must be unbalanced (fuzz boundary)", () => {
    const rng = mulberry32(0xb0011da3);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const base = Math.floor(rng() * 1_000_000);
      const r = verifyBalance(base + 2, 0, base);
      if (r.balanced || r.deltaCents !== 2) errors++;
    }
    expect(errors).toBe(0);
  });

  it("delta = -2 at various base amounts must be unbalanced (fuzz boundary)", () => {
    const rng = mulberry32(0xb0011da4);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const base = Math.floor(rng() * 1_000_000);
      const r = verifyBalance(base - 2, 0, base);
      if (r.balanced || r.deltaCents !== -2) errors++;
    }
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROBE D: non-integer (float) inputs — no throw, arithmetic flows through
// ---------------------------------------------------------------------------
describe("verifyBalance — float inputs produce consistent (if imprecise) results", () => {
  it("float inputs do not throw and return finite numbers", () => {
    const r = verifyBalance(100.5, 0.3, 100.8);
    // expected net = 100.8 - 0.3 = 100.5; delta ≈ 0 (float arithmetic)
    expect(isNaN(r.deltaCents)).toBe(false);
    expect(isFinite(r.deltaCents)).toBe(true);
  });

  it("float delta slightly over 1 is not balanced", () => {
    // matched = 101.5, expected net = 100 → delta = 1.5 → not balanced
    const r = verifyBalance(101.5, 0, 100);
    expect(r.balanced).toBe(false);
    expect(Math.abs(r.deltaCents - 1.5)).toBeLessThan(1e-9);
  });
});

// ---------------------------------------------------------------------------
// PROBE E: Infinity inputs — rejected by the finite-number guard
// ---------------------------------------------------------------------------
describe("verifyBalance — Infinity inputs are rejected", () => {
  it("Infinity matched amount throws (no poisoned Infinity deltaCents)", () => {
    expect(() => verifyBalance(Infinity, 0, 1000)).toThrow();
  });

  it("-Infinity matched amount throws (no poisoned -Infinity deltaCents)", () => {
    expect(() => verifyBalance(-Infinity, 0, 1000)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PROBE F: large-scale fuzz — balanced property is symmetric
// ---------------------------------------------------------------------------
describe("verifyBalance — large-scale fuzz correctness (1000 runs)", () => {
  const rng = mulberry32(0xf0e1d2c3);

  it("balanced iff Math.abs(matched - (ending - beginning)) <= 1 (1000 runs)", () => {
    let errors = 0;
    const RUNS = 1000;

    for (let i = 0; i < RUNS; i++) {
      const matched = Math.round((rng() - 0.5) * 2_000_000);
      const beginning = Math.round((rng() - 0.5) * 2_000_000);
      const ending = Math.round((rng() - 0.5) * 2_000_000);

      const r = verifyBalance(matched, beginning, ending);

      const expectedDelta = matched - (ending - beginning);
      const expectedBalanced = Math.abs(expectedDelta) <= 1;

      if (r.deltaCents !== expectedDelta) errors++;
      if (r.balanced !== expectedBalanced) errors++;
    }

    expect(errors).toBe(0);
  });

  it("result is deterministic (same inputs → same output) across 500 calls", () => {
    const rng2 = mulberry32(0x12345678);
    let errors = 0;
    for (let i = 0; i < 500; i++) {
      const m = Math.round(rng2() * 100_000);
      const b = Math.round(rng2() * 100_000);
      const e = Math.round(rng2() * 100_000);
      const r1 = verifyBalance(m, b, e);
      const r2 = verifyBalance(m, b, e);
      if (r1.balanced !== r2.balanced || r1.deltaCents !== r2.deltaCents) {
        errors++;
      }
    }
    expect(errors).toBe(0);
  });
});
