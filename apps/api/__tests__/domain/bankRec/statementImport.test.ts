import { describe, it, expect } from "vitest";
import { parseCsv } from "../../../src/domain/bankRec/statementImport.js";

describe("parseCsv", () => {
  it("parses a valid CSV with positive and negative amounts", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-15,ACH Deposit,500.00",
      "2024-01-16,Check #1234,-250.75",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      postedDate: "2024-01-15",
      description: "ACH Deposit",
      amountCents: 50000,
    });
    expect(lines[1]).toEqual({
      postedDate: "2024-01-16",
      description: "Check #1234",
      amountCents: -25075,
    });
  });

  it("parses quoted fields (RFC-4180)", () => {
    const csv = [
      "posted_date,description,amount",
      '2024-02-01,"Deposit, ACH",1234.56',
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      postedDate: "2024-02-01",
      description: "Deposit, ACH",
      amountCents: 123456,
    });
  });

  it("parses a quoted header row (RFC-4180) — many bank exports quote headers", () => {
    // Data rows were already parsed with the RFC-4180-aware parseRow, but the
    // header row was split on plain commas, so quoted headers kept their quotes
    // and the required-column lookup failed on an otherwise-valid file.
    const csv = [
      '"posted_date","description","amount"',
      "2024-02-01,Deposit,1234.56",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      postedDate: "2024-02-01",
      description: "Deposit",
      amountCents: 123456,
    });
  });

  it("parses a quoted header row with reordered/comma-bearing columns", () => {
    // Header order differs from the canonical order and a quoted header would
    // be mis-split by a naive comma split.
    const csv = [
      '"amount","posted_date","description"',
      '99.99,2024-03-01,"Late, fee"',
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      postedDate: "2024-03-01",
      description: "Late, fee",
      amountCents: 9999,
    });
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const csv = [
      "posted_date,description,amount",
      '2024-03-01,"He said ""hello""",99.99',
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.description).toBe('He said "hello"');
    expect(lines[0]!.amountCents).toBe(9999);
  });

  it("parses negative amounts correctly", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-04-01,Utility Payment,-1000.00",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines[0]!.amountCents).toBe(-100000);
  });

  it("handles amounts with no decimal part", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-05-01,Transfer,100",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines[0]!.amountCents).toBe(10000);
  });

  it("handles zero amount", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-05-01,Zero Entry,0.00",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines[0]!.amountCents).toBe(0);
  });

  it("handles CRLF line endings", () => {
    const csv =
      "posted_date,description,amount\r\n2024-06-01,Deposit,200.00\r\n";

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(20000);
  });

  it("skips blank trailing lines", () => {
    const csv = "posted_date,description,amount\n2024-07-01,Deposit,300.00\n\n";

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
  });

  it("throws when headers are missing required columns", () => {
    const csv = "date,desc,amt\n2024-01-01,Foo,100.00\n";

    expect(() => parseCsv(csv)).toThrow(/missing.*header/i);
  });

  it("throws when a data row has the wrong number of fields", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-01,Only Two Fields",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1/i);
  });

  it("throws when amount is not a valid number", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-01,Bad Amount,not-a-number",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1/i);
  });

  it("returns empty array for CSV with only headers", () => {
    const csv = "posted_date,description,amount\n";

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(0);
  });

  it("trims whitespace from unquoted fields", () => {
    const csv = [
      "posted_date,description,amount"," 2024-08-01 , Some Payment , 50.00",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines[0]!.postedDate).toBe("2024-08-01");
    expect(lines[0]!.description).toBe("Some Payment");
    expect(lines[0]!.amountCents).toBe(5000);
  });

  it("handles amount with only one decimal place", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-09-01,Partial Cent,10.5",
    ].join("\n");

    const lines = parseCsv(csv);

    // "10.5" → "10" + "50" (padded) → 1050
    expect(lines[0]!.amountCents).toBe(1050);
  });

  it("handles columns in different order (amount first)", () => {
    const csv = ["amount,posted_date,description", "75.00,2024-10-01,Fee"].join(
      "\n",
    );

    const lines = parseCsv(csv);

    expect(lines[0]!.amountCents).toBe(7500);
    expect(lines[0]!.postedDate).toBe("2024-10-01");
    expect(lines[0]!.description).toBe("Fee");
  });

  it("parses row with trailing comma (extra empty field)", () => {
    const csv = [
      "posted_date,description,amount,extra",
      "2024-11-01,Extra Column,25.00,ignored",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(2500);
  });

  it("handles quoted field that is last in row (no trailing comma)", () => {
    // Quoted field at end of row — tests `if (i < row.length && row[i] ===",")` false branch
    const csv = [
      "posted_date,description,amount",
      '2024-12-01,Rent,"250.00"',
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(25000);
    expect(lines[0]!.description).toBe("Rent");
  });

  it("throws when posted_date is missing (short row)", () => {
    // Headers: extra,extra2,amount,posted_date,description
    // Row with only 3 fields — postedDate at index 3 is missing → falls back to ""
    // Empty string is not a valid calendar date, so it should throw
    const csv = [
      "extra,extra2,amount,posted_date,description",
      "x,x,10.00",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1.*invalid posted_date/i);
  });

  it("throws when posted_date is an invalid calendar date (e.g. '2024-13-45')", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-13-45,Bad Date,100.00",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1.*invalid posted_date/i);
  });

  it("throws when posted_date is not a date format (e.g. 'not-a-date')", () => {
    const csv = [
      "posted_date,description,amount",
      "not-a-date,Bad Date,100.00",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1.*invalid posted_date/i);
  });

  it("accepts a valid leap year date (2024-02-29)", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-02-29,Leap Day,100.00",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.postedDate).toBe("2024-02-29");
  });

  it("throws when amount overflows int32 max (99999999999999.00)", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-15,Large Amount,99999999999999.00",
    ].join("\n");

    expect(() => parseCsv(csv)).toThrow(/row 1.*out-of-range amount/i);
  });

  it("accepts amount at int32 max boundary (21474836.47 = 2147483647 cents)", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-15,Max Positive,21474836.47",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(2147483647);
  });

  it("accepts negative amounts within int32 bounds (e.g. -50.00)", () => {
    const csv = [
      "posted_date,description,amount",
      "2024-01-15,Withdrawal,-50.00",
    ].join("\n");

    const lines = parseCsv(csv);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(-5000);
  });
});
