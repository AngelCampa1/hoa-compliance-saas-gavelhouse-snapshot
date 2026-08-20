import { describe, it, expect } from "vitest";
import {
  units,
  homeowners,
  unitOwnerships,
  assessments,
  payments,
  assessmentStatusEnum,
  paymentMethodEnum,
} from "../../src/db/schema/dues.js";

describe("dues schema — units table", () => {
  it("units table is defined", () => {
    expect(units).toBeDefined();
  });

  it("units table has id column", () => {
    expect(units.id).toBeDefined();
  });

  it("units table has communityId column", () => {
    expect(units.communityId).toBeDefined();
  });

  it("units table has address column", () => {
    expect(units.address).toBeDefined();
  });

  it("units table has unitNumber column (nullable)", () => {
    expect(units.unitNumber).toBeDefined();
  });

  it("units table has sqft column (nullable)", () => {
    expect(units.sqft).toBeDefined();
  });

  it("units table has active column", () => {
    expect(units.active).toBeDefined();
  });

  it("units table has createdAt column", () => {
    expect(units.createdAt).toBeDefined();
  });

  it("units table has updatedAt column", () => {
    expect(units.updatedAt).toBeDefined();
  });
});

describe("dues schema — homeowners table", () => {
  it("homeowners table is defined", () => {
    expect(homeowners).toBeDefined();
  });

  it("homeowners table has id column", () => {
    expect(homeowners.id).toBeDefined();
  });

  it("homeowners table has communityId column", () => {
    expect(homeowners.communityId).toBeDefined();
  });

  it("homeowners table has firstName column", () => {
    expect(homeowners.firstName).toBeDefined();
  });

  it("homeowners table has lastName column", () => {
    expect(homeowners.lastName).toBeDefined();
  });

  it("homeowners table has email column", () => {
    expect(homeowners.email).toBeDefined();
  });

  it("homeowners table has phone column (nullable)", () => {
    expect(homeowners.phone).toBeDefined();
  });

  it("homeowners table has moveInDate column (nullable)", () => {
    expect(homeowners.moveInDate).toBeDefined();
  });

  it("homeowners table has stripeCustomerId column (nullable)", () => {
    expect(homeowners.stripeCustomerId).toBeDefined();
  });

  it("homeowners table has active column", () => {
    expect(homeowners.active).toBeDefined();
  });

  it("homeowners table has createdAt column", () => {
    expect(homeowners.createdAt).toBeDefined();
  });

  it("homeowners table has updatedAt column", () => {
    expect(homeowners.updatedAt).toBeDefined();
  });
});

describe("dues schema — unitOwnerships table", () => {
  it("unitOwnerships table is defined", () => {
    expect(unitOwnerships).toBeDefined();
  });

  it("unitOwnerships table has id column", () => {
    expect(unitOwnerships.id).toBeDefined();
  });

  it("unitOwnerships table has unitId column", () => {
    expect(unitOwnerships.unitId).toBeDefined();
  });

  it("unitOwnerships table has homeownerId column", () => {
    expect(unitOwnerships.homeownerId).toBeDefined();
  });

  it("unitOwnerships table has startDate column", () => {
    expect(unitOwnerships.startDate).toBeDefined();
  });

  it("unitOwnerships table has endDate column (nullable)", () => {
    expect(unitOwnerships.endDate).toBeDefined();
  });

  it("unitOwnerships table has primary column", () => {
    expect(unitOwnerships.primary).toBeDefined();
  });
});

describe("dues schema — assessments table", () => {
  it("assessments table is defined", () => {
    expect(assessments).toBeDefined();
  });

  it("assessments table has id column", () => {
    expect(assessments.id).toBeDefined();
  });

  it("assessments table has communityId column", () => {
    expect(assessments.communityId).toBeDefined();
  });

  it("assessments table has unitId column (nullable)", () => {
    expect(assessments.unitId).toBeDefined();
  });

  it("assessments table has period column", () => {
    expect(assessments.period).toBeDefined();
  });

  it("assessments table has amountCents column", () => {
    expect(assessments.amountCents).toBeDefined();
  });

  it("assessments table has fundType column", () => {
    expect(assessments.fundType).toBeDefined();
  });

  it("assessments table has dueDate column", () => {
    expect(assessments.dueDate).toBeDefined();
  });

  it("assessments table has status column", () => {
    expect(assessments.status).toBeDefined();
  });

  it("assessments table has createdAt column", () => {
    expect(assessments.createdAt).toBeDefined();
  });

  it("assessments table has updatedAt column", () => {
    expect(assessments.updatedAt).toBeDefined();
  });
});

describe("dues schema — payments table", () => {
  it("payments table is defined", () => {
    expect(payments).toBeDefined();
  });

  it("payments table has id column", () => {
    expect(payments.id).toBeDefined();
  });

  it("payments table has assessmentId column", () => {
    expect(payments.assessmentId).toBeDefined();
  });

  it("payments table has homeownerId column (nullable)", () => {
    expect(payments.homeownerId).toBeDefined();
  });

  it("payments table has amountCents column", () => {
    expect(payments.amountCents).toBeDefined();
  });

  it("payments table has method column", () => {
    expect(payments.method).toBeDefined();
  });

  it("payments table has stripePaymentIntentId column (nullable)", () => {
    expect(payments.stripePaymentIntentId).toBeDefined();
  });

  it("payments table has receivedAt column", () => {
    expect(payments.receivedAt).toBeDefined();
  });

  it("payments table has journalEntryId column (nullable)", () => {
    expect(payments.journalEntryId).toBeDefined();
  });

  it("payments table has createdAt column", () => {
    expect(payments.createdAt).toBeDefined();
  });
});

describe("dues schema — assessmentStatusEnum", () => {
  it("assessmentStatusEnum is defined", () => {
    expect(assessmentStatusEnum).toBeDefined();
  });

  it("assessmentStatusEnum has all 4 values", () => {
    const values = assessmentStatusEnum.enumValues;
    expect(values).toHaveLength(4);
  });

  it("assessmentStatusEnum includes pending", () => {
    expect(assessmentStatusEnum.enumValues).toContain("pending");
  });

  it("assessmentStatusEnum includes paid", () => {
    expect(assessmentStatusEnum.enumValues).toContain("paid");
  });

  it("assessmentStatusEnum includes past_due", () => {
    expect(assessmentStatusEnum.enumValues).toContain("past_due");
  });

  it("assessmentStatusEnum includes waived", () => {
    expect(assessmentStatusEnum.enumValues).toContain("waived");
  });
});

describe("dues schema — paymentMethodEnum", () => {
  it("paymentMethodEnum is defined", () => {
    expect(paymentMethodEnum).toBeDefined();
  });

  it("paymentMethodEnum has all 4 values", () => {
    const values = paymentMethodEnum.enumValues;
    expect(values).toHaveLength(4);
  });

  it("paymentMethodEnum includes ach", () => {
    expect(paymentMethodEnum.enumValues).toContain("ach");
  });

  it("paymentMethodEnum includes card", () => {
    expect(paymentMethodEnum.enumValues).toContain("card");
  });

  it("paymentMethodEnum includes check", () => {
    expect(paymentMethodEnum.enumValues).toContain("check");
  });

  it("paymentMethodEnum includes other", () => {
    expect(paymentMethodEnum.enumValues).toContain("other");
  });
});
