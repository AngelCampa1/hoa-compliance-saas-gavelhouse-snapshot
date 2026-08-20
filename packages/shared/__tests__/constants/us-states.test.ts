import { describe, it, expect } from "vitest";
import { US_STATES } from "../../src/constants/us-states.js";

describe("US_STATES", () => {
  it("exports an array", () => {
    expect(Array.isArray(US_STATES)).toBe(true);
  });

  it("has exactly 51 entries (50 states + DC)", () => {
    expect(US_STATES).toHaveLength(51);
  });

  it("every entry has a label and a value", () => {
    for (const state of US_STATES) {
      expect(typeof state.label).toBe("string");
      expect(state.label.length).toBeGreaterThan(0);
      expect(typeof state.value).toBe("string");
      expect(state.value.length).toBe(2);
    }
  });

  it("every value is uppercase 2-letter code", () => {
    const re = /^[A-Z]{2}$/;
    for (const state of US_STATES) {
      expect(state.value).toMatch(re);
    }
  });

  it("all values are unique", () => {
    const values = US_STATES.map((s) => s.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("all labels are unique", () => {
    const labels = US_STATES.map((s) => s.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("is sorted alphabetically by label", () => {
    for (let i = 1; i < US_STATES.length; i++) {
      expect(
        US_STATES[i].label.localeCompare(US_STATES[i - 1].label),
      ).toBeGreaterThan(0);
    }
  });

  it("includes DC with value 'DC'", () => {
    const dc = US_STATES.find((s) => s.value === "DC");
    expect(dc).toBeDefined();
    expect(dc?.label).toBe("District of Columbia");
  });

  it("includes California with value 'CA'", () => {
    const ca = US_STATES.find((s) => s.value === "CA");
    expect(ca).toBeDefined();
    expect(ca?.label).toBe("California");
  });

  it("includes Alaska with value 'AK'", () => {
    const ak = US_STATES.find((s) => s.value === "AK");
    expect(ak).toBeDefined();
    expect(ak?.label).toBe("Alaska");
  });

  it("includes Wyoming with value 'WY'", () => {
    const wy = US_STATES.find((s) => s.value === "WY");
    expect(wy).toBeDefined();
    expect(wy?.label).toBe("Wyoming");
  });

  it("first entry alphabetically is Alabama", () => {
    expect(US_STATES[0].label).toBe("Alabama");
    expect(US_STATES[0].value).toBe("AL");
  });

  it("last entry alphabetically is Wyoming", () => {
    const last = US_STATES[US_STATES.length - 1];
    expect(last.label).toBe("Wyoming");
    expect(last.value).toBe("WY");
  });

  it("contains all expected 2-letter state codes", () => {
    const expectedCodes = [
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "DC",
      "FL",
      "GA",
      "HI",
      "ID",
      "IL",
      "IN",
      "IA",
      "KS",
      "KY",
      "LA",
      "ME",
      "MD",
      "MA",
      "MI",
      "MN",
      "MS",
      "MO",
      "MT",
      "NE",
      "NV",
      "NH",
      "NJ",
      "NM",
      "NY",
      "NC",
      "ND",
      "OH",
      "OK",
      "OR",
      "PA",
      "RI",
      "SC",
      "SD",
      "TN",
      "TX",
      "UT",
      "VT",
      "VA",
      "WA",
      "WV",
      "WI",
      "WY",
    ];
    const values = US_STATES.map((s) => s.value);
    for (const code of expectedCodes) {
      expect(values).toContain(code);
    }
  });
});
