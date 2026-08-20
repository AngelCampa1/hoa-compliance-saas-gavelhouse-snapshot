/**
 * Stress / adversarial fuzz tests for reserveStudyImport domain logic.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Strategy:
 * - Seeded PRNG (mulberry32) for deterministic reproduction.
 * - Property assertions over large generated input sets.
 * - Concrete reproductions for suspected bugs (genuine bugs use it.fails).
 */

import { describe, it, expect } from "vitest";
import {
  parseReserveStudyCsv,
  parseReserveStudyJson,
} from "../../src/domain/accounting/reserveStudyImport.js";

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
const HEADER = "component,useful_life,remaining_life,replacement_cost,current_reserve";

function makeCsvRow(
  name: string,
  useful: number,
  remaining: number,
  replacementDollars: string,
  currentDollars: string,
): string {
  return `${name},${useful},${remaining},${replacementDollars},${currentDollars}`;
}

// ---------------------------------------------------------------------------
// PROPERTY 1: round-trip integer dollar amounts are lossless
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — dollarsToCents integer amounts (fuzz)", () => {
  const rng = mulberry32(0xabcd1234);

  it("integer dollar amounts convert losslessly to cents (500 runs)", () => {
    for (let i = 0; i < 500; i++) {
      const dollars = Math.floor(rng() * 1_000_000);
      const csv = [
        HEADER,
        makeCsvRow("Roof", 20, 10, String(dollars), "0"),
      ].join("\n");
      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0]?.replacementCostCents).toBe(dollars * 100);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 2: dollarsToCents float rounding — IEEE754 bug probe
//
// reserveStudyImport.dollarsToCents uses:
//   Math.round(parseFloat(value) * 100)
//
// For "1.005": parseFloat("1.005") * 100 = 100.49999999999999 (IEEE754)
//   → Math.round(100.49...) = 100  but expected = 101
//
// This is a genuine rounding bug for half-cent values ending in .005 / .015 etc.
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — dollarsToCents half-cent rounding (bug probe)", () => {
  // "1.005" should round to 101 cents (round-half-up), but IEEE754 gives 100.
  // BUG: apps/api/src/domain/accounting/reserveStudyImport.ts:78
  //   dollarsToCents: Math.round(parseFloat(value) * 100)
  //   Input: "1.005"
  //   Expected: 101 (round half up)
  //   Actual: 100 (parseFloat("1.005") * 100 = 100.49999... → rounds down)
  it(
    "dollarsToCents('1.005') rounds to 101 cents (half-cent round-up)",
    () => {
      const csv = [HEADER, makeCsvRow("Test", 10, 5, "1.005", "0")].join("\n");
      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      // Expected: 101 cents (correct banker's/round-half-up behavior)
      // Actual: 100 cents due to IEEE754: 1.005 * 100 = 100.49999999999999
      expect(result.rows[0]?.replacementCostCents).toBe(101);
    },
  );

  // "0.005" is the smallest half-cent: 0.005 * 100 = 0.5000000000000004 → rounds to 1
  // This one actually rounds UP correctly due to floating point.
  it("dollarsToCents('0.005') rounds to 1 cent (this specific case rounds up due to float)", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, "0.005", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    // 0.005 * 100 = 0.5000000000000004 → Math.round → 1 (correct by luck)
    expect(result.rows[0]?.replacementCostCents).toBe(1);
  });

  // "2.005": 2.005 * 100 = 200.5 exactly in IEEE754 → Math.round → 201 (correct).
  // Not a bug for this value.
  it("dollarsToCents('2.005') correctly rounds to 201 cents (IEEE754 is exact here)", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, "2.005", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.replacementCostCents).toBe(201);
  });

  // "1.015": 1.015 * 100 = 101.49999999999999 → Math.round → 101, should be 102
  // BUG: same root cause as 1.005 — apps/api/src/domain/accounting/reserveStudyImport.ts:78
  //   Input: "1.015"
  //   Expected: 102 cents (round half up)
  //   Actual: 101 cents (1.015 * 100 = 101.49999999999999 → rounds down)
  it(
    "dollarsToCents('1.015') rounds to 102 cents (half-cent round-up)",
    () => {
      const csv = [HEADER, makeCsvRow("Test", 10, 5, "1.015", "0")].join("\n");
      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      // Expected: 102 cents; Actual: 101 due to IEEE754
      expect(result.rows[0]?.replacementCostCents).toBe(102);
    },
  );

  // Common two-decimal amounts should NOT be affected (they are exact or round correctly).
  it("dollarsToCents for common two-decimal amounts is correct (fuzz 200 runs)", () => {
    const rng = mulberry32(0xf00d1234);
    for (let i = 0; i < 200; i++) {
      const whole = Math.floor(rng() * 10_000);
      // Only use 0 or 5 for the cent digit to avoid IEEE754 landmines in the test itself
      const cents = Math.floor(rng() * 20) * 5; // 0,5,10,...,95
      const dollarStr = `${whole}.${String(cents).padStart(2, "0")}`;
      const expectedCents = whole * 100 + cents;
      const csv = [HEADER, makeCsvRow("Comp", 5, 2, dollarStr, "0")].join("\n");
      const result = parseReserveStudyCsv(csv);
      if (result.errors.length === 0) {
        expect(result.rows[0]?.replacementCostCents).toBe(expectedCents);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 2b: dollarsToCents edge formats (negative, leading-dot, malformed)
// Exercises the string-arithmetic branches of the hardened parser.
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — dollarsToCents edge formats", () => {
  it("negative dollar amount yields a negative cents value rejected as < 0", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, "-5.00", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    // -500 cents fails the replacementCostCents >= 0 validation.
    expect(
      result.errors.some((e) => e.field === "replacementCostCents"),
    ).toBe(true);
  });

  it("leading-dot amount ('.50') parses as 50 cents (empty whole part)", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, ".50", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.replacementCostCents).toBe(50);
  });

  it("non-numeric amount ('abc') is NaN and rejected", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, "abc", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(
      result.errors.some((e) => e.field === "replacementCostCents"),
    ).toBe(true);
  });

  it("trailing-dot amount ('7.') parses as 700 cents (empty fractional part)", () => {
    const csv = [HEADER, makeCsvRow("Test", 10, 5, "7.", "0")].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.replacementCostCents).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 3: rowIndex off-by-one when blank lines are skipped
//
// parseReserveStudyCsv increments rowIndex only for non-blank lines.
// This means the error row number reflects the logical (non-blank) data row
// position, NOT the physical CSV line number.
//
// For example:
//   line 1: header
//   line 2: blank
//   line 3: bad row  → rowIndex=1 (first non-blank data row)
//
// Whether this is intended or a bug depends on the contract. The field is
// named `row` and is used for user-visible error messages. Reporting row=1
// for a row that is physically on line 3 could confuse users.
//
// This test documents the CURRENT behavior (row counts logical rows, not
// physical lines). It does NOT mark it as it.fails because the behavior is
// internally consistent even if potentially surprising.
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — rowIndex when blank lines are skipped", () => {
  it("error rowIndex counts only non-blank data rows, not physical line numbers", () => {
    // Physical layout:
    //   line 0: header
    //   line 1: blank
    //   line 2: blank
    //   line 3: invalid row (missing name)
    const csv = [
      HEADER,
      "",
      "",
      ",10,5,1000.00,500.00", // name is empty — should trigger error
    ].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    // rowIndex is 1 (first non-blank data row seen), even though physically on line 3
    expect(result.errors[0]?.row).toBe(1);
  });

  it("rowIndex increments correctly across multiple valid rows with interspersed blanks", () => {
    const rng = mulberry32(0x99887766);
    // Build CSV with random blank lines between valid rows
    const lines = [HEADER];
    const expectedRows = 5;
    let inserted = 0;
    for (let i = 0; i < expectedRows; i++) {
      // Insert 0–2 blank lines before each data row
      const blanks = Math.floor(rng() * 3);
      for (let b = 0; b < blanks; b++) lines.push("");
      const cost = Math.floor(rng() * 100_000);
      lines.push(`Component ${i},20,10,${cost}.00,0.00`);
      inserted++;
    }
    const csv = lines.join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(inserted);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4: valid CSV rows always parse without errors (fuzz)
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — valid input fuzz", () => {
  const rng = mulberry32(0x11223344);

  it("random valid rows all parse without errors (300 runs)", () => {
    for (let i = 0; i < 300; i++) {
      const useful = Math.floor(rng() * 50) + 1;
      const remaining = Math.floor(rng() * useful);
      const replacementWhole = Math.floor(rng() * 500_000);
      const fracCents = Math.floor(rng() * 100);
      const fracStr = String(fracCents).padStart(2, "0");
      const replacementStr = `${replacementWhole}.${fracStr}`;
      const csv = [
        HEADER,
        makeCsvRow(`Component ${i}`, useful, remaining, replacementStr, "0"),
      ].join("\n");
      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 5: parseReserveStudyCsv — quoted fields with commas
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — quoted fields", () => {
  it("component name with embedded comma is parsed correctly", () => {
    const csv = [
      HEADER,
      '"Roof, Main Building",20,10,50000.00,25000.00',
    ].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.name).toBe("Roof, Main Building");
  });

  it("component name with escaped double-quote is parsed correctly", () => {
    const csv = [
      HEADER,
      '"Pool ""A""",15,8,30000.00,10000.00',
    ].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.name).toBe('Pool "A"');
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 6: parseReserveStudyCsv — replacementcostcents header (raw cents path)
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — raw cents header path", () => {
  it("replacementCostCents header passes integer cents through without conversion", () => {
    const header = "component,useful_life,remaining_life,replacementCostCents,currentReserveCents";
    const csv = [header, "Roof,20,10,500000,250000"].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.replacementCostCents).toBe(500000);
    expect(result.rows[0]?.currentReserveCents).toBe(250000);
  });

  it("replacementCostCents header rejects non-integer string values", () => {
    const header = "component,useful_life,remaining_life,replacementCostCents,currentReserveCents";
    const csv = [header, "Roof,20,10,5000.50,250000"].join("\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.field).toBe("replacementCostCents");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 7: parseReserveStudyJson — valid objects fuzz
// ---------------------------------------------------------------------------
describe("parseReserveStudyJson — valid input fuzz", () => {
  const rng = mulberry32(0x55667788);

  it("random valid JSON objects all parse without errors (300 runs)", () => {
    for (let i = 0; i < 300; i++) {
      const useful = Math.floor(rng() * 50) + 1;
      const remaining = Math.floor(rng() * useful);
      const replacementCostCents = Math.floor(rng() * 10_000_000);
      const currentReserveCents = Math.floor(rng() * replacementCostCents);
      const json = JSON.stringify([
        {
          name: `Component ${i}`,
          usefulLifeYears: useful,
          remainingLifeYears: remaining,
          replacementCostCents,
          currentReserveCents,
        },
      ]);
      const result = parseReserveStudyJson(json);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.replacementCostCents).toBe(replacementCostCents);
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 8: parseReserveStudyJson — malformed inputs produce errors, not throws
// ---------------------------------------------------------------------------
describe("parseReserveStudyJson — malformed input handling", () => {
  it("invalid JSON returns error, not throw", () => {
    const result = parseReserveStudyJson("{not json");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("json");
  });

  it("non-array JSON returns error", () => {
    const result = parseReserveStudyJson('{"name":"Roof"}');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/array/i);
  });

  it("array item that is not an object produces per-row error", () => {
    const result = parseReserveStudyJson('["not an object"]');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("null in array produces per-row error", () => {
    const result = parseReserveStudyJson("[null]");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("float usefulLifeYears is rejected", () => {
    const result = parseReserveStudyJson(
      JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 10.5,
          remainingLifeYears: 5,
          replacementCostCents: 50000,
          currentReserveCents: 25000,
        },
      ]),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.field).toBe("usefulLifeYears");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 9: parseReserveStudyCsv — empty and edge-case inputs
// ---------------------------------------------------------------------------
describe("parseReserveStudyCsv — edge cases", () => {
  it("empty string returns error", () => {
    const result = parseReserveStudyCsv("");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("header-only CSV returns empty rows and no errors", () => {
    const result = parseReserveStudyCsv(HEADER);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it("CRLF line endings are handled correctly", () => {
    const csv = [HEADER, "Roof,20,10,50000.00,25000.00"].join("\r\n");
    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });
});
