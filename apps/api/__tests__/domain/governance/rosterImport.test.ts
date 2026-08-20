import { describe, it, expect } from "vitest";
import { parseRosterCsv } from "../../../src/domain/governance/rosterImport.js";

describe("parseRosterCsv", () => {
  it("parses valid CSV with required columns", () => {
    const csv = `firstName,lastName,email,address\nJane,Smith,jane@example.com,123 Main St`;
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("jane@example.com");
    expect(rows[0].firstName).toBe("Jane");
    expect(errors).toHaveLength(0);
  });

  it("returns per-row errors for invalid rows", () => {
    const csv = `firstName,lastName,email,address\nJane,,not-an-email,123 Main St`;
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].row).toBe(2);
  });

  it("handles RFC 4180 quoted fields with commas", () => {
    const csv = `firstName,lastName,email,address\nJane,Smith,jane@example.com,"123 Oak St, Apt 4"`;
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].address).toBe("123 Oak St, Apt 4");
  });

  it("returns empty result for empty CSV", () => {
    const { rows, errors } = parseRosterCsv("");
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("handles header-only CSV gracefully", () => {
    const { rows, errors } = parseRosterCsv(
      "firstName,lastName,email,address\n",
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("returns a header error when required columns are missing", () => {
    const { rows, errors } = parseRosterCsv("bad\n");
    expect(rows).toHaveLength(0);
    expect(errors).toEqual([
      {
        row: 1,
        issues:
          "Missing required header(s): firstName, lastName, email, address",
      },
    ]);
  });

  it("is case-insensitive for header names (first_name, First_Name, etc.)", () => {
    const csv = `First_Name,Last_Name,Email,Address\nJane,Smith,jane@example.com,123 Main St`;
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].firstName).toBe("Jane");
  });

  it("allows optional columns (phone, unitNumber, moveInDate)", () => {
    const csv = `firstName,lastName,email,address,phone,unitNumber\nJane,Smith,jane@example.com,123 Main St,555-1234,4B`;
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].phone).toBe("555-1234");
    expect(rows[0].unitNumber).toBe("4B");
  });

  it("collects errors across multiple rows without stopping", () => {
    const csv = `firstName,lastName,email,address\n,Smith,jane@example.com,123 Main\nJane,Smith,jane@example.com,456 Oak`;
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("handles RFC 4180 escaped double-quote inside quoted field", () => {
    const csv = `firstName,lastName,email,address\nJane,Smith,jane@example.com,"123 ""Oak"" St"`;
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].address).toBe('123 "Oak" St');
  });

  it("handles CRLF line endings", () => {
    const csv = `firstName,lastName,email,address\r\nJane,Smith,jane@example.com,123 Main St\r\n`;
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it("maps alternative header aliases (unit, move_in_date)", () => {
    const csv = `firstName,lastName,email,address,unit,move_in_date\nJane,Smith,jane@example.com,123 Main St,5C,2024-01-15`;
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].unitNumber).toBe("5C");
    expect(rows[0].moveInDate).toBe("2024-01-15");
  });

  it("ignores unknown columns gracefully and still parses valid required fields", () => {
    const csv = `firstName,lastName,email,address,unknownColumn\nJane,Smith,jane@example.com,123 Main St,somevalue`;
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(rows[0].firstName).toBe("Jane");
  });

  it("skips empty values within a row (null-coalescing branch)", () => {
    const csv = `firstName,lastName,email,address,phone\nJane,Smith,jane@example.com,123 Main St,`;
    const { rows } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBeUndefined();
  });

  it("handles row with fewer columns than headers (undefined value fallback)", () => {
    const csv = `firstName,lastName,email,address,phone\nJane,Smith,jane@example.com,123 Main St`;
    const { rows } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBeUndefined();
  });
});
