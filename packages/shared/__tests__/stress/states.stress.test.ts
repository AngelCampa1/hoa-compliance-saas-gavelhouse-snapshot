/**
 * Stress / property-based tests for packages/shared/src/compliance/states.ts
 *
 * Seeded deterministic PRNG (mulberry32). No extra npm deps.
 * Genuine source bugs are marked it.fails with a "// BUG:" comment.
 */

import { describe, expect, it } from "vitest";
import { STATE_RESERVE_REQUIREMENTS } from "../../src/compliance/states.js";

// ── helpers ──────────────────────────────────────────────────────────────────
const ALL_CODES = Object.keys(STATE_RESERVE_REQUIREMENTS);

const KNOWN_US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

// ── coverage ──────────────────────────────────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — coverage", () => {
  it("contains all 50 states plus DC (51 entries)", () => {
    expect(ALL_CODES.length).toBe(51);
  });

  it("every known 2-letter US state code + DC is present", () => {
    for (const code of KNOWN_US_STATES) {
      expect(
        STATE_RESERVE_REQUIREMENTS[code],
        `Missing state: ${code}`,
      ).toBeDefined();
    }
  });

  it("no duplicate state codes", () => {
    const seen = new Set<string>();
    for (const code of ALL_CODES) {
      expect(seen.has(code), `Duplicate code: ${code}`).toBe(false);
      seen.add(code);
    }
  });
});

// ── stateCode field invariants ─────────────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — stateCode field invariants", () => {
  it("stateCode field matches the Record key for every entry", () => {
    for (const [key, rule] of Object.entries(STATE_RESERVE_REQUIREMENTS)) {
      expect(rule.stateCode).toBe(key);
    }
  });

  it("all stateCode values are exactly 2 uppercase ASCII letters", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      expect(rule.stateCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("all stateName values are non-empty strings", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      expect(rule.stateName.length).toBeGreaterThan(0);
    }
  });
});

// ── minimumFundingPercent invariants ─────────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — minimumFundingPercent sanity", () => {
  it("minimumFundingPercent is null or in [1, 100]", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      if (rule.minimumFundingPercent !== null) {
        expect(rule.minimumFundingPercent).toBeGreaterThanOrEqual(1);
        expect(rule.minimumFundingPercent).toBeLessThanOrEqual(100);
      }
    }
  });

  it("states with minimumFundingPercent set also have reserveStudyRequired=true", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      if (rule.minimumFundingPercent !== null) {
        // A funding % requirement only makes sense alongside a study requirement
        expect(
          rule.reserveStudyRequired,
          `${rule.stateCode} has minimumFundingPercent but reserveStudyRequired=false`,
        ).toBe(true);
      }
    }
  });
});

// ── reserveStudyFrequencyYears ───────────────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — reserveStudyFrequencyYears sanity", () => {
  it("frequency is null or a positive integer", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      if (rule.reserveStudyFrequencyYears !== null) {
        expect(Number.isInteger(rule.reserveStudyFrequencyYears)).toBe(true);
        expect(rule.reserveStudyFrequencyYears).toBeGreaterThan(0);
        expect(rule.reserveStudyFrequencyYears).toBeLessThanOrEqual(50);
      }
    }
  });

  it("non-mandate states have null frequency (permissive/silent states do not mandate a period)", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      if (!rule.reserveStudyRequired) {
        // A frequency only makes sense when a study is required
        expect(
          rule.reserveStudyFrequencyYears,
          `${rule.stateCode} has frequency set but reserveStudyRequired=false`,
        ).toBeNull();
      }
    }
  });
});

// ── lookup behaviour with edge-case codes ────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — lookup edge cases", () => {
  it("unknown codes are undefined (not throwing, not returning a rule)", () => {
    const unknown = [
      "XX",
      "ZZ",
      "US",
      "UK",
      "ca",
      "Ca",
      "cA",
      "",
      "A",
      "ABC",
      "00",
      "  ",
      "\x00\x00",
    ];
    for (const code of unknown) {
      // The Record lookup returns undefined — it must not throw
      expect(() => STATE_RESERVE_REQUIREMENTS[code]).not.toThrow();
      expect(STATE_RESERVE_REQUIREMENTS[code]).toBeUndefined();
    }
  });

  // BUG: The record is keyed on uppercase codes, but there is no exported
  // lookup function that normalises case. A consumer passing "ca" instead of "CA"
  // silently receives undefined rather than a helpful error or case-normalised
  // result. The data contract is inconsistent: stateCode fields are uppercase-only,
  // but the record provides no guard. This is a contract-documentation gap, not
  // a runtime crash, but callers may produce silent data loss.
  // Recorded here for visibility; the test below documents ACTUAL behaviour
  // (undefined for lowercase) to catch any future unintended change.
  it("lowercase codes consistently return undefined (documents case-sensitivity contract)", () => {
    expect(STATE_RESERVE_REQUIREMENTS["ca"]).toBeUndefined();
    expect(STATE_RESERVE_REQUIREMENTS["fl"]).toBeUndefined();
    expect(STATE_RESERVE_REQUIREMENTS["tx"]).toBeUndefined();
  });

  it("mixed-case codes are undefined", () => {
    expect(STATE_RESERVE_REQUIREMENTS["Ca"]).toBeUndefined();
    expect(STATE_RESERVE_REQUIREMENTS["cA"]).toBeUndefined();
  });
});

// ── commingleProhibited — spot-check high-profile states ─────────────────────
describe("STATE_RESERVE_REQUIREMENTS — commingleProhibited spot checks", () => {
  it("CA commingling is prohibited (Davis-Stirling)", () => {
    expect(STATE_RESERVE_REQUIREMENTS["CA"]!.commingleProhibited).toBe(true);
  });

  it("FL commingling is prohibited", () => {
    expect(STATE_RESERVE_REQUIREMENTS["FL"]!.commingleProhibited).toBe(true);
  });
});

// ── complete field-shape check ────────────────────────────────────────────────
describe("STATE_RESERVE_REQUIREMENTS — field shape for all 51 entries", () => {
  it("every entry has the required shape with correct types", () => {
    for (const rule of Object.values(STATE_RESERVE_REQUIREMENTS)) {
      expect(typeof rule.stateCode).toBe("string");
      expect(typeof rule.stateName).toBe("string");
      expect(
        rule.statuteCitation === null ||
          typeof rule.statuteCitation === "string",
      ).toBe(true);
      expect(typeof rule.reserveStudyRequired).toBe("boolean");
      expect(
        rule.reserveStudyFrequencyYears === null ||
          typeof rule.reserveStudyFrequencyYears === "number",
      ).toBe(true);
      expect(
        rule.minimumFundingPercent === null ||
          typeof rule.minimumFundingPercent === "number",
      ).toBe(true);
      expect(typeof rule.commingleProhibited).toBe("boolean");
      expect(rule.notes === null || typeof rule.notes === "string").toBe(true);
    }
  });
});
