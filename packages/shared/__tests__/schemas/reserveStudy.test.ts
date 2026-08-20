import { describe, it, expect } from "vitest";
import {
  reserveComponentInput,
  upsertReserveStudyInput,
  updateReserveAllocationInput,
  reserveSummaryResponse,
} from "../../src/schemas/reserveStudy.js";

describe("reserveComponentInput", () => {
  const validComponent = {
    name: "Roof",
    usefulLifeYears: 20,
    remainingLifeYears: 10,
    replacementCostCents: 5000000,
    currentReserveCents: 2500000,
  };

  it("accepts a valid component", () => {
    const result = reserveComponentInput.safeParse(validComponent);
    expect(result.success).toBe(true);
  });

  it("rejects usefulLifeYears < 1", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects usefulLifeYears of -5", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: -5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts remainingLifeYears of 0", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      remainingLifeYears: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative replacementCostCents", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      replacementCostCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative currentReserveCents", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      currentReserveCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 256 characters", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      name: "a".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer usefulLifeYears", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: 10.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer remainingLifeYears", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      remainingLifeYears: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer replacementCostCents", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      replacementCostCents: 100.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("upsertReserveStudyInput", () => {
  const validStudy = {
    communityId: "comm-1",
    effectiveDate: "2025-01-01",
    methodology: "Full Funding",
    notes: "Annual review",
    annualBudgetCents: 12000000,
    annualReserveContributionCents: 2400000,
    components: [
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ],
  };

  it("accepts a valid study with components", () => {
    const result = upsertReserveStudyInput.safeParse(validStudy);
    expect(result.success).toBe(true);
  });

  it("accepts study without optional methodology and notes", () => {
    const {
      methodology: _m,
      notes: _n,
      annualBudgetCents: _b,
      annualReserveContributionCents: _r,
      ...withoutOptional
    } = validStudy;
    const result = upsertReserveStudyInput.safeParse(withoutOptional);
    expect(result.success).toBe(true);
  });

  it("rejects annual reserve contribution without annual budget", () => {
    const { annualBudgetCents: _b, ...withoutBudget } = validStudy;
    const result = upsertReserveStudyInput.safeParse(withoutBudget);
    expect(result.success).toBe(false);
  });

  it("rejects annual budget without annual reserve contribution", () => {
    const { annualReserveContributionCents: _r, ...withoutContribution } =
      validStudy;
    const result = upsertReserveStudyInput.safeParse(withoutContribution);
    expect(result.success).toBe(false);
  });

  it("rejects annual reserve contribution above annual budget", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...validStudy,
      annualBudgetCents: 100000,
      annualReserveContributionCents: 100001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty communityId", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...validStudy,
      communityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid effectiveDate format", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...validStudy,
      effectiveDate: "01/01/2025",
    });
    expect(result.success).toBe(false);
  });

  it("rejects components array with zero elements", () => {
    const result = upsertReserveStudyInput.safeParse({
      ...validStudy,
      components: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateReserveAllocationInput", () => {
  it("accepts paired annual budget allocation values", () => {
    const result = updateReserveAllocationInput.safeParse({
      communityId: "comm-1",
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 1800000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects reserve contribution above annual budget", () => {
    const result = updateReserveAllocationInput.safeParse({
      communityId: "comm-1",
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 12000001,
    });
    expect(result.success).toBe(false);
  });
});

describe("reserveSummaryResponse", () => {
  const validSummary = {
    studyId: "study-1",
    effectiveDate: "2025-01-01",
    components: [
      {
        id: "comp-1",
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ],
    totalReserveBalance: 2500000,
    totalProjectedNeed: 5000000,
    percentFunded: 50,
    annualBudgetCents: 12000000,
    annualReserveContributionCents: 2400000,
    allocationPercent: 20,
    fannieMaeCompliant: true,
    fannieMaeComplianceBasis: "annual_budget_allocation",
    stateRequirements: {
      stateCode: "CA",
      stateName: "California",
      reserveStudyRequired: true,
      minimumFundingPercent: null,
      statuteCitation: "Davis-Stirling Act (Civil Code §5550-5560)",
    },
  };

  it("accepts a valid summary response", () => {
    const result = reserveSummaryResponse.safeParse(validSummary);
    expect(result.success).toBe(true);
  });

  it("accepts null studyId (no study yet)", () => {
    const result = reserveSummaryResponse.safeParse({
      ...validSummary,
      studyId: null,
      effectiveDate: null,
      components: [],
      percentFunded: null,
      annualBudgetCents: null,
      annualReserveContributionCents: null,
      allocationPercent: null,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: null,
      stateRequirements: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects fannieMaeCompliant without a supported annual budget allocation basis", () => {
    const result = reserveSummaryResponse.safeParse({
      ...validSummary,
      allocationPercent: 10,
      fannieMaeCompliant: false,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
    });
    expect(result.success).toBe(false);
  });

  it("accepts stateRequirements: null", () => {
    const result = reserveSummaryResponse.safeParse({
      ...validSummary,
      stateRequirements: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts stateRequirements with null minimumFundingPercent", () => {
    const result = reserveSummaryResponse.safeParse(validSummary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stateRequirements?.minimumFundingPercent).toBeNull();
    }
  });
});

// INT32 overflow guard tests
describe("int32 overflow guard — reserveStudy schemas", () => {
  const INT32_MAX = 2147483647;
  const validComponent = {
    name: "Roof",
    usefulLifeYears: 20,
    remainingLifeYears: 10,
    replacementCostCents: 5000000,
    currentReserveCents: 2500000,
  };

  it("rejects reserveComponentInput.replacementCostCents above INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      replacementCostCents: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reserveComponentInput.currentReserveCents above INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      currentReserveCents: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reserveComponentInput.usefulLifeYears above INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reserveComponentInput.remainingLifeYears above INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      remainingLifeYears: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts reserveComponentInput with usefulLifeYears at INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: INT32_MAX,
    });
    expect(result.success).toBe(true);
  });

  it("accepts reserveComponentInput with remainingLifeYears at INT32_MAX", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      remainingLifeYears: INT32_MAX,
      usefulLifeYears: INT32_MAX,
    });
    expect(result.success).toBe(true);
  });

  it("rejects reserveComponentInput when remainingLifeYears > usefulLifeYears", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: 5,
      remainingLifeYears: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts reserveComponentInput when remainingLifeYears == usefulLifeYears", () => {
    const result = reserveComponentInput.safeParse({
      ...validComponent,
      usefulLifeYears: 10,
      remainingLifeYears: 10,
    });
    expect(result.success).toBe(true);
  });
});
