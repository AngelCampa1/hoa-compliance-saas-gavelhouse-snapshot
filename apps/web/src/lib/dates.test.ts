import { describe, it, expect } from "vitest";
import { getCurrentYear, formatArticleDate, normalizeDateInput } from "./dates";

describe("getCurrentYear", () => {
  it("returns a 4-digit number", () => {
    const year = getCurrentYear();
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(year).toBeLessThan(10000);
  });
});

describe("formatArticleDate", () => {
  it('formats "2026-03-20" with March, 20, and 2026', () => {
    const result = formatArticleDate("2026-03-20");
    expect(result).toContain("March");
    expect(result).toContain("20");
    expect(result).toContain("2026");
  });

  it('formats "2026-01-01" with January, 1, and 2026', () => {
    const result = formatArticleDate("2026-01-01");
    expect(result).toContain("January");
    expect(result).toContain("1");
    expect(result).toContain("2026");
  });

  it("formats a mid-year date correctly", () => {
    const result = formatArticleDate("2025-07-15");
    expect(result).toContain("July");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("returns a non-empty string", () => {
    expect(formatArticleDate("2026-12-31").length).toBeGreaterThan(0);
  });

  it("handles ISO datetime strings with T separator", () => {
    const result = formatArticleDate("2026-06-15T10:30:00");
    expect(result).toContain("June");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });
});

describe("normalizeDateInput", () => {
  it("returns string input unchanged", () => {
    expect(normalizeDateInput("2026-03-20")).toBe("2026-03-20");
  });

  it("converts a Date object to YYYY-MM-DD", () => {
    // month is 0-indexed: 2 = March
    expect(normalizeDateInput(new Date(2026, 2, 20))).toBe("2026-03-20");
  });

  it("zero-pads single-digit month and day", () => {
    // month 0 = January, day 5
    expect(normalizeDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
