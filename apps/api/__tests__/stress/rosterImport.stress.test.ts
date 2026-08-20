/**
 * Stress / adversarial fuzz tests for rosterImport domain logic.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Strategy:
 * - Seeded PRNG (mulberry32) for deterministic reproduction.
 * - Property assertions covering splitCsvRow edge cases, HEADER_MAP mapping,
 *   BOM handling, CRLF, moveInDate format acceptance, and duplicate/unknown
 *   header shadowing.
 * - Genuine bugs are gated with it.fails + a comment block (source file:line,
 *   reproducing input, Expected vs Actual).
 * - Refuted suspicions are kept as passing documenting tests.
 */

import { describe, it, expect } from "vitest";
import { parseRosterCsv } from "../../src/domain/governance/rosterImport.js";

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
// Helpers
// ---------------------------------------------------------------------------
const VALID_HEADER = "firstName,lastName,email,address";
const VALID_DATA_ROW = "Alice,Smith,alice@example.com,123 Main St";

function makeCsv(header: string, ...dataRows: string[]): string {
  return [header, ...dataRows].join("\n");
}

// ---------------------------------------------------------------------------
// PROPERTY 1: Happy-path round-trip (baseline sanity)
// ---------------------------------------------------------------------------
describe("parseRosterCsv — happy path", () => {
  it("parses a minimal valid CSV", () => {
    const csv = makeCsv(VALID_HEADER, VALID_DATA_ROW);
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rowNumbers).toEqual([2]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      address: "123 Main St",
    });
  });

  it("accepts alternate header aliases (first_name, last_name, unit_number)", () => {
    const csv = makeCsv(
      "first_name,last_name,email,address,unit_number",
      "Bob,Jones,bob@example.com,456 Oak Ave,101",
    );
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.firstName).toBe("Bob");
    expect(result.rows[0]!.unitNumber).toBe("101");
  });

  it("accepts 'unit' as alias for unitNumber", () => {
    const csv = makeCsv(
      "firstName,lastName,email,address,unit",
      "Carol,Davis,carol@example.com,789 Pine Rd,2B",
    );
    const result = parseRosterCsv(csv);
    expect(result.rows[0]!.unitNumber).toBe("2B");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 2: CRLF line endings (refuted suspicion — handled by /\r?\n/)
// ---------------------------------------------------------------------------
describe("parseRosterCsv — CRLF line endings", () => {
  it("handles CRLF endings correctly (not a bug — regex /\\r?\\n/ covers it)", () => {
    const csv = `${VALID_HEADER}\r\n${VALID_DATA_ROW}`;
    const result = parseRosterCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.firstName).toBe("Alice");
  });

  it("handles mixed CRLF and LF endings", () => {
    const csv = `${VALID_HEADER}\r\nAlice,Smith,alice@example.com,123 Main St\nBob,Jones,bob@example.com,456 Oak Ave`;
    const result = parseRosterCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 3: Empty / whitespace-only CSV
// ---------------------------------------------------------------------------
describe("parseRosterCsv — empty inputs", () => {
  it("returns empty result for empty string", () => {
    const result = parseRosterCsv("");
    expect(result.rows).toHaveLength(0);
    expect(result.rowNumbers).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty result for whitespace-only string", () => {
    const result = parseRosterCsv("   \n  \n  ");
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty rows (but no error) when header row is present but no data rows", () => {
    const result = parseRosterCsv(VALID_HEADER);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4: Missing required headers
// The error IS present (row: 1) and rowNumbers IS empty. The caller must
// check errors.length, not rowNumbers.length, to distinguish "no data" from
// "bad header". This is consistent behavior — not a silent failure.
// ---------------------------------------------------------------------------
describe("parseRosterCsv — missing required headers", () => {
  it("returns a row-1 error and empty rowNumbers when firstName is missing", () => {
    const csv = makeCsv("lastName,email,address", "Smith,alice@example.com,123 Main");
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.rowNumbers).toHaveLength(0);
    // The error IS present even though rowNumbers is empty — callers must
    // check errors.length to know WHY there are no rows.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(1);
    expect(result.errors[0]!.issues).toMatch(/Missing required header/i);
  });

  it("error message names every missing field", () => {
    const csv = makeCsv("email", "foo@bar.com");
    const result = parseRosterCsv(csv);
    expect(result.errors[0]!.issues).toContain("firstName");
    expect(result.errors[0]!.issues).toContain("lastName");
    expect(result.errors[0]!.issues).toContain("address");
  });

  it("rowNumbers.length === 0 does NOT distinguish missing-header from no-data-rows — caller must also check errors", () => {
    // Both cases produce rowNumbers: [] but are semantically different.
    const noData = parseRosterCsv(VALID_HEADER);
    const badHeader = parseRosterCsv(makeCsv("email", "foo@bar.com"));

    expect(noData.rowNumbers).toHaveLength(0);
    expect(badHeader.rowNumbers).toHaveLength(0);

    // Only errors.length discriminates the two cases.
    expect(noData.errors).toHaveLength(0);
    expect(badHeader.errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 5: Empty / whitespace cells in data rows
// ---------------------------------------------------------------------------
describe("parseRosterCsv — empty/whitespace data cells", () => {
  it("treats whitespace-only required cell as absent and emits a row error", () => {
    // firstName is all spaces → trimmed to "" → not added to raw → Zod fails min(1)
    const csv = makeCsv(VALID_HEADER, "   ,Smith,alice@example.com,123 Main St");
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(2);
  });

  it("accepts an optional field being empty (phone)", () => {
    const csv = makeCsv(
      "firstName,lastName,email,address,phone",
      "Alice,Smith,alice@example.com,123 Main St,",
    );
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    // phone is optional — absent is fine
    expect(result.rows[0]!.phone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 6: Quoted fields in splitCsvRow (via parseRosterCsv)
// ---------------------------------------------------------------------------
describe("parseRosterCsv — quoted fields", () => {
  it("parses fields with commas inside quotes", () => {
    const csv = makeCsv(
      VALID_HEADER,
      `Alice,Smith,alice@example.com,"123 Main St, Apt 4"`,
    );
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.address).toBe("123 Main St, Apt 4");
  });

  it("parses escaped double-quotes inside quoted fields", () => {
    const csv = makeCsv(
      VALID_HEADER,
      `Alice,Smith,alice@example.com,"123 ""Main"" St"`,
    );
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.address).toBe('123 "Main" St');
  });

  /**
   * REFUTED SUSPICION: unterminated quote in splitCsvRow.
   *
   * When a quoted field is never closed (e.g. `"unclosed`), splitCsvRow
   * continues accumulating characters until end-of-string and then pushes
   * `current` via `result.push(current)` at line 23. No exception is thrown
   * and the partial content is included in the returned array.
   *
   * This is lenient/permissive behavior (not a crash), consistent with many
   * CSV parsers. The resulting field value will contain the literal content
   * after the opening quote. Because the field value is garbage, Zod
   * validation will likely reject the row (e.g. invalid email), producing a
   * row-level error — which is the correct observable outcome for corrupt CSV.
   *
   * No source bug to flag: the function does not promise strict RFC 4180
   * compliance and does not advertise error-on-unterminated-quote semantics.
   */
  it("unterminated quote: field content is included (lenient, no crash — refuted as a bug)", () => {
    // `"unclosed` — inQuotes stays true, characters accumulate, push at end
    const csv = makeCsv(
      VALID_HEADER,
      `Alice,Smith,alice@example.com,"unclosed address`,
    );
    // Should not throw
    expect(() => parseRosterCsv(csv)).not.toThrow();
    const result = parseRosterCsv(csv);
    // The row either succeeds (if address content is non-empty) or fails
    // Zod validation — either is acceptable; the key invariant is no crash.
    expect(result.rows.length + result.errors.length).toBeGreaterThan(0);
  });

  it("fuzz: splitCsvRow never throws on arbitrary byte-strings (500 runs)", () => {
    const rng = mulberry32(0xf077cafe);
    const chars = 'abcABC123,"\\r\n\t \x00﻿';
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(rng() * 80);
      let line = "";
      for (let j = 0; j < len; j++) {
        line += chars[Math.floor(rng() * chars.length)];
      }
      // Replace embedded newlines so parseRosterCsv sees one header line + one data line
      const safeLine = line.replace(/[\r\n]/g, " ");
      const csv = `${VALID_HEADER}\n${safeLine}`;
      expect(() => parseRosterCsv(csv)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 7: Duplicate / aliased headers mapping to same canonical field
//
// REFUTED SUSPICION: This is deterministic last-wins overwrite behavior.
// When two CSV columns map to the same canonical field (e.g. "firstName" and
// "first_name" both appear), the later column's value overwrites the earlier
// one in the `raw` object (rosterImport.ts:83-85). No crash, no silent data
// corruption beyond the predictable last-wins outcome. Since callers supply
// CSVs they generate, duplicate canonical-field columns are malformed input
// and last-wins is an acceptable (if undocumented) behavior.
// ---------------------------------------------------------------------------
describe("parseRosterCsv — duplicate / shadowed headers", () => {
  it("last duplicate canonical-field value wins (no crash, deterministic)", () => {
    // Both 'firstName' and 'first_name' map to canonical 'firstName'.
    // The second column's value should win.
    const csv = makeCsv(
      "firstName,first_name,lastName,email,address",
      "Alice,OVERWRITE,Smith,alice@example.com,123 Main St",
    );
    const result = parseRosterCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    // last-wins: 'first_name' column (idx 1) overwrites 'firstName' (idx 0)
    expect(result.rows[0]!.firstName).toBe("OVERWRITE");
  });

  it("unknown headers that don't alias any canonical field are stored under their raw name (no crash)", () => {
    // 'nickname' is not in HEADER_MAP — stored as 'nickname' in raw, ignored by Zod
    const csv = makeCsv(
      "firstName,lastName,email,address,nickname",
      "Alice,Smith,alice@example.com,123 Main St,Ali",
    );
    const result = parseRosterCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 8: BOM in first header
//
// REFUTED SUSPICION: A UTF-8 BOM (U+FEFF) prepended to the first header cell
// was suspected to break HEADER_MAP lookup.
//
// Actual behavior: JavaScript's String.prototype.trim() strips U+FEFF because
// it is classified as whitespace (zero-width no-break space). The header pipeline
// (rosterImport.ts:54-55) calls `.trim().toLowerCase()` before the HEADER_MAP
// lookup, so a BOM-prefixed "firstname" becomes "firstname" which correctly maps to "firstName".
// BOM is NOT a bug — it is silently and correctly handled.
// ---------------------------------------------------------------------------
describe("parseRosterCsv — BOM in first header (refuted suspicion)", () => {
  it("BOM prefix on first header is stripped by .trim() and parses correctly (not a bug)", () => {
    const bom = "﻿";
    const csv = `${bom}firstName,lastName,email,address\nAlice,Smith,alice@example.com,123 Main St`;
    const result = parseRosterCsv(csv);
    // .trim() removes U+FEFF so the header maps correctly
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.firstName).toBe("Alice");
  });

  it("BOM at start of 'first_name' alias also handled correctly", () => {
    const bom = "﻿";
    const csv = `${bom}first_name,last_name,email,address\nBob,Jones,bob@example.com,456 Oak`;
    const result = parseRosterCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.firstName).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 9: moveInDate locale format ("01/15/2024") silently accepted
//
// GENUINE BUG: rosterRowSchema defines moveInDate as z.string().optional()
// with no format constraint, so any string (including "01/15/2024" locale
// format) passes Zod validation and ends up in the row unvalidated.
// The addHomeownerInput schema (used by the API route that consumes imported
// rows) defines moveInDate as calendarDateString (YYYY-MM-DD only).
//
// Source: packages/shared/src/schemas/governance.ts:75
//   moveInDate: z.string().optional(),
//   vs addHomeownerInput:87
//   moveInDate: calendarDateString.optional(),
//
// Reproducing input:
//   CSV with move_in_date column containing "01/15/2024"
//
// Expected: import raises a clear per-row error explaining that moveInDate
//           must be in YYYY-MM-DD format, so the user can fix the source data.
// Actual:   "01/15/2024" passes rosterRowSchema.safeParse successfully and
//           is returned as moveInDate: "01/15/2024", which will be silently
//           rejected (or cause an error) only when the API route attempts to
//           persist the row using addHomeownerInput.
// ---------------------------------------------------------------------------
it(
  "moveInDate in locale format (01/15/2024) raises a clear per-row import error",
  () => {
    const csv = makeCsv(
      "firstName,lastName,email,address,move_in_date",
      "Alice,Smith,alice@example.com,123 Main St,01/15/2024",
    );
    const result = parseRosterCsv(csv);
    // Row-level error referencing the moveInDate field / date format.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.issues).toMatch(/date/i);
    expect(result.rows).toHaveLength(0);
  },
);

// Also documents that a valid ISO date is correctly accepted (not broken):
it("moveInDate in ISO format (YYYY-MM-DD) is accepted (correct behavior)", () => {
  const csv = makeCsv(
    "firstName,lastName,email,address,move_in_date",
    "Alice,Smith,alice@example.com,123 Main St,2024-01-15",
  );
  const result = parseRosterCsv(csv);
  expect(result.errors).toHaveLength(0);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]!.moveInDate).toBe("2024-01-15");
});

// ---------------------------------------------------------------------------
// PROPERTY 10: Invalid email in data row produces a per-row error
// ---------------------------------------------------------------------------
describe("parseRosterCsv — Zod validation on data rows", () => {
  it("emits a row error for invalid email", () => {
    const csv = makeCsv(VALID_HEADER, "Alice,Smith,not-an-email,123 Main St");
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(2);
  });

  it("row numbers reflect 1-based CSV line numbers (header = row 1)", () => {
    const csv = makeCsv(
      VALID_HEADER,
      "Alice,Smith,alice@example.com,123 Main St", // row 2 — valid
      "Bob,Jones,bad-email,456 Oak Ave", // row 3 — invalid
      "Carol,Davis,carol@example.com,789 Pine Rd", // row 4 — valid
    );
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rowNumbers).toEqual([2, 4]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 11: Fuzz — large valid CSV produces correct row count
// ---------------------------------------------------------------------------
describe("parseRosterCsv — fuzz large valid CSV", () => {
  it("correctly parses 500 valid rows (row count matches)", () => {
    const rng = mulberry32(0xabcdef01);
    const rows: string[] = [];
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rng() * 8) + 1;
      const name = "User" + String(i).padStart(4, "0");
      rows.push(`${name},Last${n},user${i}@example.com,${i} Main St`);
    }
    const csv = [VALID_HEADER, ...rows].join("\n");
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(500);
    expect(result.errors).toHaveLength(0);
    expect(result.rowNumbers).toHaveLength(500);
  });
});
