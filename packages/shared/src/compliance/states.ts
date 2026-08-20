export interface StateReserveRule {
  stateCode: string; // 2-letter uppercase, e.g. "CA"
  stateName: string; // Full name, e.g. "California"
  statuteCitation: string | null; // e.g. "Davis-Stirling Act (Civil Code §5550)"
  reserveStudyRequired: boolean;
  reserveStudyFrequencyYears: number | null; // null if not specified
  minimumFundingPercent: number | null; // null if no state-level funding minimum is specified
  commingleProhibited: boolean; // explicit state-level commingling prohibition
  notes: string | null; // brief summary or null
}

/**
 * Per-state HOA reserve fund requirements for all 50 US states + DC.
 *
 * Data sourced from the Gavelhouse 50-state reserve fund requirements guide.
 * States are classified as:
 *   - Mandate states: reserve study required by statute
 *   - Disclosure states: reserve disclosures required, formal study not mandated
 *   - Permissive states: reserves authorized/encouraged but not mandated
 *   - Silent states: no specific reserve provisions
 *
 * All associations are also subject to Fannie Mae's reserve allocation
 * requirement (15% for Full Review loan applications on or after January 4,
 * 2027 per Lender Letter LL-2026-03), regardless of state law.
 */
export const STATE_RESERVE_REQUIREMENTS: Record<string, StateReserveRule> = {
  // ─── MANDATE STATES ────────────────────────────────────────────────────────
  CA: {
    stateCode: "CA",
    stateName: "California",
    statuteCitation: "Davis-Stirling Act (Civil Code §5550-5560)",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 3,
    minimumFundingPercent: null,
    commingleProhibited: true,
    notes:
      "Visual inspection annually; full study every 3 years. Boards must disclose percent-funded status annually with 30-year funding plan. Penalties: $100-$500/day. SB 900 (2024), AB 2114 (2024), SB 410 (2025). CA Civ. Code §5510 explicitly prohibits commingling of reserve and operating funds.",
  },
  CO: {
    stateCode: "CO",
    stateName: "Colorado",
    statuteCitation: "Colorado Common Interest Ownership Act §38-33.3-209.5",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 5,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Recommended every 5 years; required for communities above assessment threshold. Must disclose reserve balance and percent-funded status.",
  },
  DE: {
    stateCode: "DE",
    stateName: "Delaware",
    statuteCitation: "Delaware Uniform Common Interest Ownership Act §81-318",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 5,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes: "At least every 5 years. Reserve study must include a funding plan.",
  },
  FL: {
    stateCode: "FL",
    stateName: "Florida",
    statuteCitation: "Chapter 718 (condos) / Chapter 720 (HOAs)",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 10,
    minimumFundingPercent: null,
    commingleProhibited: true,
    notes:
      "SIRS every 10 years for condos/co-ops 3+ stories; milestone inspections at 30 years (25 near coast). Reserve waiver banned for SIRS structural components. DBPR can fine condo/co-op boards up to $5,000/violation under §718.501(1)(d)(6) and F.A.C. 61B-21 (HOAs are not under DBPR jurisdiction; enforced via member civil action). SB 4-D (2022), HB 913 (2025). Most comprehensive post-Surfside reforms. FL Stat. §718.111(14) requires separate accounting of condo reserves and operating funds (joint investment permitted only with separate accounting). §720.303 imposes the same separate-accounting duty on HOAs.",
  },
  HI: {
    stateCode: "HI",
    stateName: "Hawaii",
    statuteCitation: "HRS §514B-148",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: 50,
    commingleProhibited: false,
    notes:
      "HRS §514B-148 requires condos to maintain at least 50% of estimated replacement reserves (or 100% under a cash-flow funding plan). Act 62 (2022) updated the 30-year reserve study horizon. Act 296 (2025, SB 1044) established a state-level Condominium Loan Program to finance essential repairs and deferred maintenance. It does not itself set the 50% floor.",
  },
  MD: {
    stateCode: "MD",
    stateName: "Maryland",
    statuteCitation: "Maryland Homeowners Association Act §11B-112",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: true,
    notes:
      "HB 107 (2022, Chapter 664) mandated reserve studies; HB 292 (2025, Chapter 519, effective Oct 1, 2025) added mandatory funding. Associations must adopt a funding plan and deposit reserve contributions per the most recent reserve study by fiscal year-end. Reserve provisions live in §11B-112.2 (annual budget) and §11B-112.3 (reserve study) for HOAs; §11-109.4 governs condo reserve studies. Enforcement is via the Maryland AG Consumer Protection Division.",
  },
  NV: {
    stateCode: "NV",
    stateName: "Nevada",
    statuteCitation: "NRS §116.31152",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 5,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "At least every 5 years. Must include 30-year plan with annual contribution schedule. SB 56 pending.",
  },
  OR: {
    stateCode: "OR",
    stateName: "Oregon",
    statuteCitation: "ORS §100.175",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 4, // midpoint of 3-5 year range
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Every 3-5 years depending on community type. Must include a funding plan.",
  },
  TN: {
    stateCode: "TN",
    stateName: "Tennessee",
    statuteCitation: "Tennessee Community Association Act",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Study required but funding levels not mandated. SB 863 (2023). Weakest post-Surfside reform.",
  },
  UT: {
    stateCode: "UT",
    stateName: "Utah",
    statuteCitation: "Utah Community Association Act §57-8a",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 6,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes: "At least every 6 years. Must disclose reserve balance.",
  },
  VA: {
    stateCode: "VA",
    stateName: "Virginia",
    statuteCitation: "Virginia Property Owners' Association Act §55.1-1826",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 5,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "At least every 5 years. Must include component analysis and funding plan. HB 1209 (2024).",
  },
  WA: {
    stateCode: "WA",
    stateName: "Washington",
    statuteCitation: "RCW §64.34.382 (condos) / §64.90 (common interest)",
    reserveStudyRequired: true,
    reserveStudyFrequencyYears: 3,
    minimumFundingPercent: null,
    commingleProhibited: true,
    notes:
      "At least every 3 years. Must include a 30-year funding plan. RCW 64.34.364 (condos) requires separate reserve accounts; commingling of reserve and operating funds prohibited.",
  },

  // ─── DISCLOSURE STATES ─────────────────────────────────────────────────────
  CT: {
    stateCode: "CT",
    stateName: "Connecticut",
    statuteCitation: "Common Interest Ownership Act §47-261",
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Must disclose reserve fund balance in annual financial reports. SB 212 pending to mandate studies.",
  },
  IL: {
    stateCode: "IL",
    stateName: "Illinois",
    statuteCitation: "Condo Property Act (765 ILCS 605)",
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Must disclose reserve fund status; no formal study required. HB 2563 / SB 1703 pending.",
  },
  NJ: {
    stateCode: "NJ",
    stateName: "New Jersey",
    statuteCitation: "Condominium Act (N.J.S.A. 46:8B)",
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: true,
    notes:
      "Must disclose reserve fund balance. S2760 (2024), S3992 (2025) established baseline funding rules. Balance can never drop below $0. N.J.S.A. 46:8B-19 requires separate accounts; commingling of reserve and operating funds prohibited for condos.",
  },
  NY: {
    stateCode: "NY",
    stateName: "New York",
    statuteCitation: "Real Property Law / General Business Law",
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Must disclose reserve fund information in offering plans and annual reports. S7600 / A8945 pending.",
  },
  PA: {
    stateCode: "PA",
    stateName: "Pennsylvania",
    statuteCitation: "Uniform Planned Community Act (68 Pa.C.S. §5304)",
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes: "Must include reserve information in public offering statement.",
  },

  // ─── PERMISSIVE STATES ─────────────────────────────────────────────────────
  AZ: {
    stateCode: "AZ",
    stateName: "Arizona",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  GA: {
    stateCode: "GA",
    stateName: "Georgia",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  MA: {
    stateCode: "MA",
    stateName: "Massachusetts",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  MI: {
    stateCode: "MI",
    stateName: "Michigan",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  MN: {
    stateCode: "MN",
    stateName: "Minnesota",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  MO: {
    stateCode: "MO",
    stateName: "Missouri",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  NC: {
    stateCode: "NC",
    stateName: "North Carolina",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  SC: {
    stateCode: "SC",
    stateName: "South Carolina",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },
  TX: {
    stateCode: "TX",
    stateName: "Texas",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Permissive: reserves authorized but not mandated. Fiduciary duty is the primary enforcement mechanism.",
  },

  // ─── SILENT STATES ─────────────────────────────────────────────────────────
  AL: {
    stateCode: "AL",
    stateName: "Alabama",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  AK: {
    stateCode: "AK",
    stateName: "Alaska",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  AR: {
    stateCode: "AR",
    stateName: "Arkansas",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  DC: {
    stateCode: "DC",
    stateName: "District of Columbia",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  ID: {
    stateCode: "ID",
    stateName: "Idaho",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  IN: {
    stateCode: "IN",
    stateName: "Indiana",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  IA: {
    stateCode: "IA",
    stateName: "Iowa",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  KS: {
    stateCode: "KS",
    stateName: "Kansas",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  KY: {
    stateCode: "KY",
    stateName: "Kentucky",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  LA: {
    stateCode: "LA",
    stateName: "Louisiana",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  ME: {
    stateCode: "ME",
    stateName: "Maine",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  MS: {
    stateCode: "MS",
    stateName: "Mississippi",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  MT: {
    stateCode: "MT",
    stateName: "Montana",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  NE: {
    stateCode: "NE",
    stateName: "Nebraska",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  NH: {
    stateCode: "NH",
    stateName: "New Hampshire",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  NM: {
    stateCode: "NM",
    stateName: "New Mexico",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  ND: {
    stateCode: "ND",
    stateName: "North Dakota",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  OH: {
    stateCode: "OH",
    stateName: "Ohio",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  OK: {
    stateCode: "OK",
    stateName: "Oklahoma",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  RI: {
    stateCode: "RI",
    stateName: "Rhode Island",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  SD: {
    stateCode: "SD",
    stateName: "South Dakota",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  VT: {
    stateCode: "VT",
    stateName: "Vermont",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  WV: {
    stateCode: "WV",
    stateName: "West Virginia",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  WI: {
    stateCode: "WI",
    stateName: "Wisconsin",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
  WY: {
    stateCode: "WY",
    stateName: "Wyoming",
    statuteCitation: null,
    reserveStudyRequired: false,
    reserveStudyFrequencyYears: null,
    minimumFundingPercent: null,
    commingleProhibited: false,
    notes:
      "Silent: no specific reserve fund provisions. General fiduciary duty and Fannie Mae requirements apply.",
  },
};
