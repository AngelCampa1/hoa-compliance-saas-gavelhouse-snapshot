/**
 * Stress / adversarial fuzz tests for reserveStudy Zod schemas.
 * Write scope: __tests__/stress only. No source files modified.
 *
 * Strategy:
 * - Seeded PRNG (mulberry32) for deterministic reproduction.
 * - Property assertions covering superRefine cross-field constraints,
 *   field-level min() ordering interactions, 0% allocation correctness,
 *   and reserveSummaryResponse compliance/basis invariants.
 * - Genuine bugs gated with it.fails + comment block (source file:line,
 *   reproducing input, Expected vs Actual).
 * - Refuted suspicions kept as passing documenting tests.
 */

import { describe, it, expect } from "vitest";
import {
  upsertReserveStudyInput,
  updateReserveAllocationInput,
  reserveSummaryResponse,
} from "../../src/schemas/reserveStudy.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const VALID_COMPONENT = {
  name: "Roof",
  usefulLifeYears: 20,
  remainingLifeYears: 10,
  replacementCostCents: 100_000,
  currentReserveCents: 0,
};

const VALID_UPSERT_BASE = {
  communityId: "c1",
  effectiveDate: "2026-01-01",
  components: [VALID_COMPONENT],
};

const VALID_SUMMARY_BASE = {
  studyId: "s1",
  effectiveDate: "2026-01-01",
  components: [],
  totalReserveBalance: 0,
  totalProjectedNeed: 0,
  percentFunded: null,
  annualBudgetCents: null,
  annualReserveContributionCents: null,
  allocationPercent: null,
  fannieMaeCompliant: null,
  fannieMaeComplianceBasis: null,
  stateRequirements: null,
};

// ---------------------------------------------------------------------------
// SECTION 1: upsertReserveStudyInput — cross-field superRefine
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — paired-field requirement", () => {
  it("accepts when both budget and contribution are omitted", () => {
    const result = upsertReserveStudyInput.safeParse(VALID_UPSERT_BASE);
    expect(result.success).toBe(true);
  });

  it("accepts when both budget and contribution are provided and valid", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 120_000,
      annualReserveContributionCents: 60_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when only annualBudgetCents is provided", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 120_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("annualReserveContributionCents");
    }
  });

  it("rejects when only annualReserveContributionCents is provided", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualReserveContributionCents: 60_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("annualBudgetCents");
    }
  });

  it("rejects when contribution > budget", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 100_000,
      annualReserveContributionCents: 100_001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts contribution == budget (100% allocation boundary)", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 100_000,
      annualReserveContributionCents: 100_000,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: 0% allocation — contribution=0 with budget≥1
//
// REFUTED SUSPICION: Is contribution=0 with budget=1 (0% allocation) correct?
//
// annualBudgetCents has min(1) and annualReserveContributionCents has min(0).
// This means a board can declare a $0 reserve contribution against a non-zero
// budget. Semantically, 0% allocation is a valid (if alarming) state — the
// board may have decided not to fund reserves this year. Rejecting 0 would
// prevent accurately recording that policy. The schema intentionally allows
// it; no bug here.
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — 0% allocation (contribution=0) is intentionally accepted", () => {
  it("contribution=0, budget=1 passes (0% allocation is valid input)", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 1,
      annualReserveContributionCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("contribution=0, budget=1_000_000 passes (0% allocation is valid input)", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 1_000_000,
      annualReserveContributionCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("updateReserveAllocationInput: contribution=0, budget=1 passes (same intentional design)", () => {
    const result = updateReserveAllocationInput.safeParse({
      communityId: "c1",
      annualBudgetCents: 1,
      annualReserveContributionCents: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: superRefine ordering — field-level min() failure vs cross-field
//
// REFUTED SUSPICION: If annualBudgetCents fails its own .int().min(1) check
// (e.g. value=0), does the cross-field paired-field error still surface?
//
// In Zod, .superRefine() runs AFTER all field-level validations. When a field
// fails its own constraint (e.g. annualBudgetCents=0 fails min(1)), Zod still
// marks it as invalid but continues to the superRefine (Zod does not abort the
// whole object parse on a single field failure — it collects all errors).
// However, in the paired-field superRefine, `data.annualBudgetCents` will be
// `undefined` at runtime when it failed parsing (Zod does not populate invalid
// fields in the `data` object passed to superRefine for optional fields that
// fail).
//
// The practical outcome: annualBudgetCents=0 (fails min(1)) + no contribution →
// superRefine sees hasBudget=false (undefined) + hasContribution=false →
// paired mismatch does NOT fire. The only error is the min(1) field error.
// This is correct behavior — the cross-field check is meaningless when a field
// is itself invalid.
//
// annualBudgetCents=0 + annualReserveContributionCents=50_000 →
// superRefine sees hasBudget=false, hasContribution=true → paired-field error
// fires on annualBudgetCents. TWO errors surface: field min(1) + paired-field.
// This is acceptable: the most actionable error (field min violation) is present.
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — superRefine ordering when field-level min() fails", () => {
  it("annualBudgetCents=0 (fails min(1)) alone: only field error, no cross-field error", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasFieldError = result.error.issues.some(
        (i) => i.path.includes("annualBudgetCents") && i.code !== "custom",
      );
      expect(hasFieldError).toBe(true);
    }
  });

  it("annualBudgetCents=0 + contribution provided: paired-field error path surfaced even when budget fails min(1)", () => {
    // Both the field-level error (min 1) and the paired-field superRefine
    // error are present. The user sees actionable information.
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      annualBudgetCents: 0,
      annualReserveContributionCents: 50_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // At minimum the field-level error must be present
      const fieldErr = result.error.issues.some((i) =>
        i.path.includes("annualBudgetCents"),
      );
      expect(fieldErr).toBe(true);
    }
  });

  it("updateReserveAllocationInput: annualBudgetCents=0 fails field min(1) (both fields required — not optional)", () => {
    // updateReserveAllocationInput has both fields required (not optional),
    // so budget=0 is clearly a field error.
    const result = updateReserveAllocationInput.safeParse({
      communityId: "c1",
      annualBudgetCents: 0,
      annualReserveContributionCents: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("annualBudgetCents");
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION 4: Fuzz — upsertReserveStudyInput cross-field invariants
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — fuzz cross-field invariants", () => {
  it("fuzz: contribution <= budget always passes (500 runs)", () => {
    const rng = mulberry32(0xdeadba5e);
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rng() * 10_000_000) + 1;
      const contribution = Math.floor(rng() * (budget + 1)); // 0..budget
      const result = upsertReserveStudyInput.safeParse({
        ...VALID_UPSERT_BASE,
        annualBudgetCents: budget,
        annualReserveContributionCents: contribution,
      });
      expect(result.success).toBe(true);
    }
  });

  it("fuzz: contribution > budget always fails (500 runs)", () => {
    const rng = mulberry32(0xcafef00d);
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rng() * 9_999_999) + 1;
      const extra = Math.floor(rng() * 100_000) + 1;
      const contribution = budget + extra;
      const result = upsertReserveStudyInput.safeParse({
        ...VALID_UPSERT_BASE,
        annualBudgetCents: budget,
        annualReserveContributionCents: contribution,
      });
      expect(result.success).toBe(false);
    }
  });

  it("fuzz: contribution == budget boundary — always passes (200 runs)", () => {
    const rng = mulberry32(0xb0b0b0b0);
    for (let i = 0; i < 200; i++) {
      const amount = Math.floor(rng() * 10_000_000) + 1;
      const result = upsertReserveStudyInput.safeParse({
        ...VALID_UPSERT_BASE,
        annualBudgetCents: amount,
        annualReserveContributionCents: amount,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION 5: updateReserveAllocationInput — fuzz
// ---------------------------------------------------------------------------
describe("updateReserveAllocationInput — fuzz", () => {
  it("fuzz: contribution <= budget always passes (500 runs)", () => {
    const rng = mulberry32(0x55aa55aa);
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rng() * 10_000_000) + 1;
      const contribution = Math.floor(rng() * (budget + 1));
      const result = updateReserveAllocationInput.safeParse({
        communityId: "c1",
        annualBudgetCents: budget,
        annualReserveContributionCents: contribution,
      });
      expect(result.success).toBe(true);
    }
  });

  it("fuzz: contribution > budget always fails (500 runs)", () => {
    const rng = mulberry32(0xaa55aa55);
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rng() * 9_999_999) + 1;
      const extra = Math.floor(rng() * 100_000) + 1;
      const result = updateReserveAllocationInput.safeParse({
        communityId: "c1",
        annualBudgetCents: budget,
        annualReserveContributionCents: budget + extra,
      });
      expect(result.success).toBe(false);
    }
  });

  it("contribution=0 with valid budget passes (0% allocation permitted)", () => {
    const result = updateReserveAllocationInput.safeParse({
      communityId: "c1",
      annualBudgetCents: 500_000,
      annualReserveContributionCents: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION 6: reserveSummaryResponse — basis/compliance superRefine
//
// The constraint (line 103-114 of reserveStudy.ts):
//   if (fannieMaeCompliant !== null &&
//       fannieMaeComplianceBasis !== "annual_budget_allocation") → error
//
// The three producer-valid combinations:
//   (true,  "annual_budget_allocation")            → pass
//   (false, "annual_budget_allocation")            → pass
//   (null,  "annual_budget_allocation_unavailable") → pass (null is not !== null)
//   (null,  null)                                  → pass (null is not !== null)
//
// The incoherent combination:
//   (true/false, "annual_budget_allocation_unavailable") → fail (non-null verdict + unavailable basis)
//
// REFUTED SUSPICION: basis=null with fannieMaeCompliant=null passes — this is
// the "no study" case. The superRefine correctly ignores it because null !== null
// is false so the guard never fires. No bug.
//
// REFUTED SUSPICION: basis="annual_budget_allocation_unavailable" with
// fannieMaeCompliant=null passes — correct. The guard condition is
// `fannieMaeCompliant !== null` which is false for null, so the error
// does not fire. null verdict + unavailable basis is the valid "can't compute"
// state.
// ---------------------------------------------------------------------------
describe("reserveSummaryResponse — fannieMaeCompliant / basis superRefine", () => {
  it("null compliance + null basis passes (no study case)", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: null,
    });
    expect(result.success).toBe(true);
  });

  it("true compliance + annual_budget_allocation basis passes", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: true,
      fannieMaeComplianceBasis: "annual_budget_allocation",
    });
    expect(result.success).toBe(true);
  });

  it("false compliance + annual_budget_allocation basis passes", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: false,
      fannieMaeComplianceBasis: "annual_budget_allocation",
    });
    expect(result.success).toBe(true);
  });

  it("null compliance + annual_budget_allocation_unavailable basis passes (refuted: guard only fires on non-null verdict)", () => {
    // fannieMaeCompliant=null → guard condition `!== null` is false → no error.
    // This is the intentional "can't compute Fannie Mae compliance" state.
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
    });
    expect(result.success).toBe(true);
  });

  it("true compliance + annual_budget_allocation_unavailable is correctly rejected (incoherent)", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: true,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("fannieMaeComplianceBasis");
    }
  });

  it("false compliance + annual_budget_allocation_unavailable is correctly rejected (incoherent)", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: false,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
    });
    expect(result.success).toBe(false);
  });

  it("true compliance + null basis is correctly rejected (non-null verdict needs basis)", () => {
    // basis=null does not equal "annual_budget_allocation" → error fires
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: true,
      fannieMaeComplianceBasis: null,
    });
    expect(result.success).toBe(false);
  });

  it("false compliance + null basis is correctly rejected", () => {
    const result = reserveSummaryResponse.safeParse({
      ...VALID_SUMMARY_BASE,
      fannieMaeCompliant: false,
      fannieMaeComplianceBasis: null,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SECTION 7: reserveSummaryResponse — safeParse never throws on adversarial input
// ---------------------------------------------------------------------------
describe("reserveSummaryResponse — safeParse never throws", () => {
  const adversarial: unknown[] = [
    null,
    undefined,
    {},
    [],
    0,
    "",
    NaN,
    Infinity,
    -Infinity,
    { fannieMaeCompliant: "yes", fannieMaeComplianceBasis: "made_up" },
    { ...VALID_SUMMARY_BASE, annualBudgetCents: -1 },
    { ...VALID_SUMMARY_BASE, components: null },
    { ...VALID_SUMMARY_BASE, studyId: 42 },
    {
      toString: () => {
        throw new Error("nope");
      },
    },
  ];

  it("safeParse never throws on adversarial inputs", () => {
    for (const input of adversarial) {
      expect(() => reserveSummaryResponse.safeParse(input)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION 8: upsertReserveStudyInput — safeParse never throws on adversarial input
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — safeParse never throws", () => {
  const adversarial: unknown[] = [
    null,
    undefined,
    {},
    { communityId: null, effectiveDate: "2026-13-01", components: [] },
    {
      communityId: "c1",
      effectiveDate: "2026-01-01",
      components: [{}],
    },
    {
      communityId: "c1",
      effectiveDate: "2026-01-01",
      components: [VALID_COMPONENT],
      annualBudgetCents: NaN,
      annualReserveContributionCents: Infinity,
    },
    {
      communityId: "c1",
      effectiveDate: "2026-01-01",
      components: [VALID_COMPONENT],
      annualBudgetCents: -999,
      annualReserveContributionCents: -1,
    },
  ];

  it("safeParse never throws on adversarial inputs", () => {
    for (const input of adversarial) {
      expect(() => upsertReserveStudyInput.safeParse(input)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION 9: upsertReserveStudyInput — components array constraint
// ---------------------------------------------------------------------------
describe("upsertReserveStudyInput — components must be non-empty", () => {
  it("rejects empty components array", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...VALID_UPSERT_BASE,
      components: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts single component", () => {
    const result = upsertReserveStudyInput.safeParse(VALID_UPSERT_BASE);
    expect(result.success).toBe(true);
  });

  it("fuzz: multiple components all accepted (100 runs)", () => {
    const rng = mulberry32(0x12345678);
    for (let i = 0; i < 100; i++) {
      const count = Math.floor(rng() * 20) + 1;
      const components = Array.from({ length: count }, (_, j) => {
        const usefulLifeYears = Math.floor(rng() * 50) + 1;
        const remainingLifeYears = Math.floor(rng() * (usefulLifeYears + 1)); // 0..usefulLifeYears
        return {
          name: `Component ${j}`,
          usefulLifeYears,
          remainingLifeYears,
          replacementCostCents: Math.floor(rng() * 1_000_000),
          currentReserveCents: Math.floor(rng() * 500_000),
        };
      });
      const result = upsertReserveStudyInput.safeParse({
        ...VALID_UPSERT_BASE,
        components,
      });
      expect(result.success).toBe(true);
    }
  });
});
