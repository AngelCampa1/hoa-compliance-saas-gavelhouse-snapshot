import { describe, expect, it } from "vitest";
import {
  yearMonthString,
  calendarDateString,
} from "../../src/schemas/dateValidity.js";

// ── yearMonthString ───────────────────────────────────────────────────────────
describe("yearMonthString", () => {
  it("accepts valid months 01–12", () => {
    const valid = [
      "2026-01",
      "2026-02",
      "2026-06",
      "2026-09",
      "2026-11",
      "2026-12",
      "2000-01",
      "1999-12",
      "2099-06",
    ];
    for (const v of valid) {
      expect(yearMonthString.safeParse(v).success, `Should pass: ${v}`).toBe(
        true,
      );
    }
  });

  it("rejects month 00", () => {
    expect(yearMonthString.safeParse("2026-00").success).toBe(false);
  });

  it("rejects month 13", () => {
    expect(yearMonthString.safeParse("2026-13").success).toBe(false);
  });

  it("rejects month 99", () => {
    expect(yearMonthString.safeParse("2026-99").success).toBe(false);
  });

  it("rejects wrong format (YYYY-MM-DD)", () => {
    expect(yearMonthString.safeParse("2026-01-01").success).toBe(false);
  });

  it("rejects non-string", () => {
    expect(yearMonthString.safeParse(202601).success).toBe(false);
    expect(yearMonthString.safeParse(null).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(yearMonthString.safeParse("").success).toBe(false);
  });

  it("rejects partial format", () => {
    expect(yearMonthString.safeParse("2026-1").success).toBe(false);
    expect(yearMonthString.safeParse("2026").success).toBe(false);
  });
});

// ── calendarDateString ────────────────────────────────────────────────────────
describe("calendarDateString", () => {
  it("accepts valid calendar dates", () => {
    const valid = [
      "2026-01-01",
      "2026-01-31",
      "2026-02-28",
      "2024-02-29", // 2024 is a leap year
      "2026-04-30",
      "2026-12-31",
      "2000-02-29", // 2000 is a leap year
    ];
    for (const v of valid) {
      expect(calendarDateString.safeParse(v).success, `Should pass: ${v}`).toBe(
        true,
      );
    }
  });

  it("rejects month 00", () => {
    expect(calendarDateString.safeParse("2026-00-01").success).toBe(false);
  });

  it("rejects month 13", () => {
    expect(calendarDateString.safeParse("2026-13-01").success).toBe(false);
  });

  it("rejects day 00", () => {
    expect(calendarDateString.safeParse("2026-01-00").success).toBe(false);
  });

  it("rejects Feb 30 in a non-leap year", () => {
    expect(calendarDateString.safeParse("2026-02-30").success).toBe(false);
  });

  it("rejects Feb 29 in a non-leap year", () => {
    expect(calendarDateString.safeParse("2025-02-29").success).toBe(false);
  });

  it("accepts Feb 29 in a leap year", () => {
    expect(calendarDateString.safeParse("2024-02-29").success).toBe(true);
  });

  it("rejects day 32", () => {
    expect(calendarDateString.safeParse("2026-01-32").success).toBe(false);
  });

  it("rejects April 31 (only 30 days)", () => {
    expect(calendarDateString.safeParse("2026-04-31").success).toBe(false);
  });

  it("rejects wrong format (YYYY-MM)", () => {
    expect(calendarDateString.safeParse("2026-01").success).toBe(false);
  });

  it("rejects non-string", () => {
    expect(calendarDateString.safeParse(20260101).success).toBe(false);
    expect(calendarDateString.safeParse(null).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(calendarDateString.safeParse("").success).toBe(false);
  });

  it("rejects century non-leap year Feb 29 (1900)", () => {
    // 1900 is not a leap year (divisible by 100 but not 400)
    expect(calendarDateString.safeParse("1900-02-29").success).toBe(false);
  });

  it("accepts century leap year Feb 29 (2000)", () => {
    // 2000 is a leap year (divisible by 400)
    expect(calendarDateString.safeParse("2000-02-29").success).toBe(true);
  });
});
