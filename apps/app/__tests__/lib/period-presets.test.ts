import { describe, it, expect } from "vitest";
import { getPeriodPresets, getSingleDatePresets } from "@/lib/period-presets";

// Fixed reference: March 15, 2024 (Q1, mid-month)
const REF = new Date(2024, 2, 15); // March 15 2024

describe("getPeriodPresets", () => {
  it("returns 4 presets", () => {
    expect(getPeriodPresets(REF)).toHaveLength(4);
  });

  it("This Month: from = first of March, to = March 15", () => {
    const [thisMonth] = getPeriodPresets(REF);
    expect(thisMonth.label).toBe("This Month");
    expect(thisMonth.from).toBe("2024-03-01");
    expect(thisMonth.to).toBe("2024-03-15");
  });

  it("Last Month: from = Feb 1, to = Feb 29 (2024 is a leap year)", () => {
    const [, lastMonth] = getPeriodPresets(REF);
    expect(lastMonth.label).toBe("Last Month");
    expect(lastMonth.from).toBe("2024-02-01");
    expect(lastMonth.to).toBe("2024-02-29");
  });

  it("This Quarter: from = Jan 1 (Q1 start), to = March 15", () => {
    const [, , thisQuarter] = getPeriodPresets(REF);
    expect(thisQuarter.label).toBe("This Quarter");
    expect(thisQuarter.from).toBe("2024-01-01");
    expect(thisQuarter.to).toBe("2024-03-15");
  });

  it("YTD: from = Jan 1, to = March 15", () => {
    const [, , , ytd] = getPeriodPresets(REF);
    expect(ytd.label).toBe("YTD");
    expect(ytd.from).toBe("2024-01-01");
    expect(ytd.to).toBe("2024-03-15");
  });

  it("uses today as default when no arg provided", () => {
    const presets = getPeriodPresets();
    expect(presets).toHaveLength(4);
    presets.forEach((p) => {
      expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("Q2 start is April 1 when ref date is May 10", () => {
    const may10 = new Date(2024, 4, 10); // May 10 2024
    const [, , thisQuarter] = getPeriodPresets(may10);
    expect(thisQuarter.from).toBe("2024-04-01");
  });

  it("Q3 start is July 1 when ref date is August 5", () => {
    const aug5 = new Date(2024, 7, 5); // Aug 5 2024
    const [, , thisQuarter] = getPeriodPresets(aug5);
    expect(thisQuarter.from).toBe("2024-07-01");
  });

  it("Q4 start is October 1 when ref date is December 1", () => {
    const dec1 = new Date(2024, 11, 1); // Dec 1 2024
    const [, , thisQuarter] = getPeriodPresets(dec1);
    expect(thisQuarter.from).toBe("2024-10-01");
  });
});

describe("getSingleDatePresets", () => {
  it("returns 4 presets", () => {
    expect(getSingleDatePresets(REF)).toHaveLength(4);
  });

  it("This Month: asOf = today", () => {
    const [thisMonth] = getSingleDatePresets(REF);
    expect(thisMonth.label).toBe("This Month");
    expect(thisMonth.asOf).toBe("2024-03-15");
  });

  it("Last Month: asOf = end of Feb (Feb 29 in leap year)", () => {
    const [, lastMonth] = getSingleDatePresets(REF);
    expect(lastMonth.label).toBe("Last Month");
    expect(lastMonth.asOf).toBe("2024-02-29");
  });

  it("This Quarter: asOf = today", () => {
    const [, , thisQuarter] = getSingleDatePresets(REF);
    expect(thisQuarter.label).toBe("This Quarter");
    expect(thisQuarter.asOf).toBe("2024-03-15");
  });

  it("YTD: asOf = today (year-to-date runs through the reference date, not last year's close)", () => {
    const [, , , ytd] = getSingleDatePresets(REF);
    expect(ytd.label).toBe("YTD");
    expect(ytd.asOf).toBe("2024-03-15");
  });

  it("uses today as default when no arg provided", () => {
    const presets = getSingleDatePresets();
    expect(presets).toHaveLength(4);
    presets.forEach((p) => {
      expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
