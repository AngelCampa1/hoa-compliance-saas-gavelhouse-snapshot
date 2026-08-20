import { describe, it, expect } from "vitest";
import {
  STAGE_BADGES,
  formatContentDate,
  filterMetadata,
} from "./content-helpers";

describe("STAGE_BADGES", () => {
  it("has tofu with label Guide and non-empty classes", () => {
    expect(STAGE_BADGES.tofu.label).toBe("Guide");
    expect(STAGE_BADGES.tofu.classes.length).toBeGreaterThan(0);
  });

  it("has mofu with label Compare and non-empty classes", () => {
    expect(STAGE_BADGES.mofu.label).toBe("Compare");
    expect(STAGE_BADGES.mofu.classes.length).toBeGreaterThan(0);
  });

  it("has bofu with label Alternative and non-empty classes", () => {
    expect(STAGE_BADGES.bofu.label).toBe("Alternative");
    expect(STAGE_BADGES.bofu.classes.length).toBeGreaterThan(0);
  });

  it("has all three buyer stages as keys", () => {
    expect(Object.keys(STAGE_BADGES)).toEqual(
      expect.arrayContaining(["tofu", "mofu", "bofu"]),
    );
    expect(Object.keys(STAGE_BADGES)).toHaveLength(3);
  });
});

describe("formatContentDate", () => {
  it("formats a date string with month, day, and year", () => {
    const result = formatContentDate("2026-01-15T12:00:00");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });

  it("normalizes date-only strings to avoid timezone shift", () => {
    // "2024-01-15" without T00:00:00 is parsed as UTC midnight,
    // which shifts to Jan 14 in negative-UTC timezones
    const result = formatContentDate("2024-01-15");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("still works correctly with datetime strings containing T", () => {
    const result = formatContentDate("2025-06-20T14:30:00");
    expect(result).toContain("Jun");
    expect(result).toContain("20");
    expect(result).toContain("2025");
  });
});

describe("filterMetadata", () => {
  it("returns empty array for undefined", () => {
    expect(filterMetadata(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(filterMetadata({})).toEqual([]);
  });

  it("filters out falsy values", () => {
    expect(filterMetadata({ a: "x", b: "", c: "y" })).toEqual([
      ["a", "x"],
      ["c", "y"],
    ]);
  });

  it("returns single entry for single-key object", () => {
    expect(filterMetadata({ a: "only" })).toEqual([["a", "only"]]);
  });

  it("excludes keys in excludeKeys list", () => {
    expect(
      filterMetadata({ a: "x", readTime: "5 min", c: "y" }, ["readTime"]),
    ).toEqual([
      ["a", "x"],
      ["c", "y"],
    ]);
  });

  it("handles empty excludeKeys list", () => {
    expect(filterMetadata({ a: "x" }, [])).toEqual([["a", "x"]]);
  });
});
