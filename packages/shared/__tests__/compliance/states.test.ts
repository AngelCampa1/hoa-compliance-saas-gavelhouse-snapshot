import { describe, it, expect } from "vitest";
import {
  STATE_RESERVE_REQUIREMENTS,
  type StateReserveRule,
} from "../../src/compliance/states.js";

// All US state codes + DC (51 total)
const ALL_STATE_CODES = [
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

describe("STATE_RESERVE_REQUIREMENTS", () => {
  it("has entries for all 50 US states + DC (≥51 total)", () => {
    const keys = Object.keys(STATE_RESERVE_REQUIREMENTS);
    expect(keys.length).toBeGreaterThanOrEqual(51);
  });

  it("has an entry for every expected state code", () => {
    for (const code of ALL_STATE_CODES) {
      expect(
        STATE_RESERVE_REQUIREMENTS[code],
        `Missing entry for state code: ${code}`,
      ).toBeDefined();
    }
  });

  it("California has reserveStudyRequired=true and a Davis-Stirling or Civil Code citation", () => {
    const ca = STATE_RESERVE_REQUIREMENTS["CA"];
    expect(ca).toBeDefined();
    expect(ca.reserveStudyRequired).toBe(true);
    expect(ca.statuteCitation).not.toBeNull();
    const citation = ca.statuteCitation as string;
    expect(
      citation.includes("Davis-Stirling") || citation.includes("Civil Code"),
    ).toBe(true);
  });

  it("Florida has reserveStudyRequired=true and a statute citation containing '718'", () => {
    const fl = STATE_RESERVE_REQUIREMENTS["FL"];
    expect(fl).toBeDefined();
    expect(fl.reserveStudyRequired).toBe(true);
    expect(fl.statuteCitation).not.toBeNull();
    expect((fl.statuteCitation as string).includes("718")).toBe(true);
  });

  it("Washington state entry exists with stateCode 'WA'", () => {
    const wa = STATE_RESERVE_REQUIREMENTS["WA"];
    expect(wa).toBeDefined();
    expect(wa.stateCode).toBe("WA");
  });

  it("every entry has a valid 2-letter stateCode matching ^[A-Z]{2}$", () => {
    const re = /^[A-Z]{2}$/;
    for (const [key, rule] of Object.entries(STATE_RESERVE_REQUIREMENTS)) {
      expect(rule.stateCode, `stateCode mismatch for key ${key}`).toMatch(re);
      expect(rule.stateCode, `key does not match stateCode for ${key}`).toBe(
        key,
      );
    }
  });

  it("every entry has a non-empty stateName", () => {
    for (const [key, rule] of Object.entries(STATE_RESERVE_REQUIREMENTS)) {
      expect(
        rule.stateName.length,
        `stateName empty for ${key}`,
      ).toBeGreaterThan(0);
    }
  });

  it("no entry has minimumFundingPercent below 0", () => {
    for (const [key, rule] of Object.entries(STATE_RESERVE_REQUIREMENTS)) {
      if (rule.minimumFundingPercent !== null) {
        expect(
          rule.minimumFundingPercent,
          `minimumFundingPercent negative for ${key}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("the StateReserveRule type is correctly shaped for a known entry", () => {
    const ca: StateReserveRule = STATE_RESERVE_REQUIREMENTS["CA"];
    expect(typeof ca.stateCode).toBe("string");
    expect(typeof ca.stateName).toBe("string");
    expect(typeof ca.reserveStudyRequired).toBe("boolean");
    expect(
      ca.reserveStudyFrequencyYears === null ||
        typeof ca.reserveStudyFrequencyYears === "number",
    ).toBe(true);
    expect(
      ca.minimumFundingPercent === null ||
        typeof ca.minimumFundingPercent === "number",
    ).toBe(true);
    expect(typeof ca.commingleProhibited).toBe("boolean");
    expect(ca.notes === null || typeof ca.notes === "string").toBe(true);
  });

  it("mandate states (CA, FL, HI, MD, NV, OR, TN, UT, VA, WA, CO, DE) all have reserveStudyRequired=true", () => {
    const mandateStateCodes = [
      "CA",
      "FL",
      "HI",
      "MD",
      "NV",
      "OR",
      "TN",
      "UT",
      "VA",
      "WA",
      "CO",
      "DE",
    ];
    for (const code of mandateStateCodes) {
      const rule = STATE_RESERVE_REQUIREMENTS[code];
      expect(
        rule.reserveStudyRequired,
        `${code} should have reserveStudyRequired=true`,
      ).toBe(true);
    }
  });
});
