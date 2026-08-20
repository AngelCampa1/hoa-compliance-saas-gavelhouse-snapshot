import { describe, expect, it } from "vitest";
import {
  getGavelhouseAsCompetitor,
  getGavelhouseComparisonRows,
} from "../src/marketing/gavelhouse-as-competitor.js";

describe("getGavelhouseAsCompetitor", () => {
  it("returns an object with the expected shape", () => {
    const data = getGavelhouseAsCompetitor();
    expect(data).toMatchObject({
      name: expect.any(String),
      slug: "gavelhouse",
      pricing: expect.any(String),
      pros: expect.any(Array),
      cons: expect.any(Array),
    });
  });

  it("has slug exactly equal to 'gavelhouse'", () => {
    expect(getGavelhouseAsCompetitor().slug).toBe("gavelhouse");
  });

  it("pricing string contains a dollar sign", () => {
    expect(getGavelhouseAsCompetitor().pricing).toContain("$");
  });

  it("pros is a non-empty array of strings", () => {
    const { pros } = getGavelhouseAsCompetitor();
    expect(pros.length).toBeGreaterThan(0);
    for (const pro of pros) {
      expect(typeof pro).toBe("string");
      expect(pro.length).toBeGreaterThan(0);
    }
  });

  it("cons is a non-empty array of strings", () => {
    const { cons } = getGavelhouseAsCompetitor();
    expect(cons.length).toBeGreaterThan(0);
    for (const con of cons) {
      expect(typeof con).toBe("string");
      expect(con.length).toBeGreaterThan(0);
    }
  });

  it("name is Gavelhouse", () => {
    expect(getGavelhouseAsCompetitor().name).toBe("Gavelhouse");
  });
});

describe("getGavelhouseComparisonRows", () => {
  it("returns a non-empty array", () => {
    const rows = getGavelhouseComparisonRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("every row has a label and gavelhouseValue string", () => {
    const rows = getGavelhouseComparisonRows();
    for (const row of rows) {
      expect(typeof row.label).toBe("string");
      expect(row.label.length).toBeGreaterThan(0);
      expect(typeof row.gavelhouseValue).toBe("string");
      expect(row.gavelhouseValue.length).toBeGreaterThan(0);
    }
  });

  it("includes a price row", () => {
    const rows = getGavelhouseComparisonRows();
    const priceRow = rows.find((r) => r.label.toLowerCase().includes("price"));
    expect(priceRow).toBeDefined();
  });

  it("includes a trial row", () => {
    const rows = getGavelhouseComparisonRows();
    const trialRow = rows.find((r) => r.label.toLowerCase().includes("trial"));
    expect(trialRow).toBeDefined();
  });

  it("includes a fund separation row", () => {
    const rows = getGavelhouseComparisonRows();
    const fundRow = rows.find(
      (r) =>
        r.label.toLowerCase().includes("fund") ||
        r.label.toLowerCase().includes("separation"),
    );
    expect(fundRow).toBeDefined();
  });
});
