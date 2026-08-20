import { describe, it, expect } from "vitest";
import {
  HOMEOWNER_CSV_TEMPLATE,
  RESERVE_STUDY_CSV_TEMPLATE,
} from "../../src/constants/csv-templates.js";

describe("HOMEOWNER_CSV_TEMPLATE", () => {
  it("exports a string", () => {
    expect(typeof HOMEOWNER_CSV_TEMPLATE).toBe("string");
  });

  it("has at least 3 lines (header + 2 example rows)", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("first line is the expected header", () => {
    const firstLine = HOMEOWNER_CSV_TEMPLATE.trim().split("\n")[0];
    expect(firstLine.trim()).toBe(
      "firstName,lastName,email,phone,address,unitNumber,moveInDate",
    );
  });

  it("header columns are: firstName, lastName, email, phone, address, unitNumber, moveInDate", () => {
    const headerLine = HOMEOWNER_CSV_TEMPLATE.trim().split("\n")[0];
    const columns = headerLine.split(",");
    expect(columns[0]).toBe("firstName");
    expect(columns[1]).toBe("lastName");
    expect(columns[2]).toBe("email");
    expect(columns[3]).toBe("phone");
    expect(columns[4]).toBe("address");
    expect(columns[5]).toBe("unitNumber");
    expect(columns[6]).toBe("moveInDate");
  });

  it("has exactly 2 example data rows after the header", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    expect(lines.length).toBe(3);
  });

  it("example rows each have 7 comma-separated fields", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");
    expect(row1).toHaveLength(7);
    expect(row2).toHaveLength(7);
  });

  it("example rows have non-empty firstName and lastName fields", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");
    expect(row1[0].trim().length).toBeGreaterThan(0);
    expect(row1[1].trim().length).toBeGreaterThan(0);
    expect(row2[0].trim().length).toBeGreaterThan(0);
    expect(row2[1].trim().length).toBeGreaterThan(0);
  });

  it("example rows have non-empty email fields", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");
    expect(row1[2].trim()).toContain("@");
    expect(row2[2].trim()).toContain("@");
  });

  it("example rows have non-empty address fields", () => {
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");
    expect(row1[4].trim().length).toBeGreaterThan(0);
    expect(row2[4].trim().length).toBeGreaterThan(0);
  });

  it("moveInDate fields look like dates (YYYY-MM-DD pattern)", () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const lines = HOMEOWNER_CSV_TEMPLATE.trim().split("\n");
    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");
    expect(row1[6].trim()).toMatch(datePattern);
    expect(row2[6].trim()).toMatch(datePattern);
  });
});

describe("RESERVE_STUDY_CSV_TEMPLATE", () => {
  it("first line is the expected header", () => {
    const firstLine = RESERVE_STUDY_CSV_TEMPLATE.trim().split("\n")[0];
    expect(firstLine.trim()).toBe(
      "component,usefulLife,remainingLife,replacementCost,currentReserve",
    );
  });

  it("has exactly 3 data rows after the header", () => {
    const lines = RESERVE_STUDY_CSV_TEMPLATE.trim().split("\n");
    expect(lines.length).toBe(4);
  });

  it("contains the Roof example row", () => {
    expect(RESERVE_STUDY_CSV_TEMPLATE).toContain("Roof,25,10,80000,32000");
  });

  it("contains the Parking lot example row", () => {
    expect(RESERVE_STUDY_CSV_TEMPLATE).toContain(
      "Parking lot,20,8,40000,16000",
    );
  });

  it("contains the Pool example row", () => {
    expect(RESERVE_STUDY_CSV_TEMPLATE).toContain("Pool,15,5,20000,8000");
  });
});
