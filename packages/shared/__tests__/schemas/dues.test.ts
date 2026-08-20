import { describe, it, expect } from "vitest";
import {
  createUnitInput,
  createHomeownerInput,
  createAssessmentInput,
  payDuesInput,
} from "../../src/schemas/dues.js";

describe("createUnitInput", () => {
  it("accepts valid unit with required fields", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid unit with all optional fields", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
      unitNumber: "4B",
      sqft: 1200,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty communityId", () => {
    const result = createUnitInput.safeParse({
      communityId: "",
      address: "123 Main St",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty address", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects address longer than 256 characters", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "A".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative sqft", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
      sqft: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer sqft", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
      sqft: 1200.5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts sqft of 0", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
      sqft: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("createHomeownerInput", () => {
  it("accepts valid homeowner with required fields", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid homeowner with all optional fields", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "555-1234",
      moveInDate: "2023-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "",
      lastName: "Smith",
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects firstName over 100 characters", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "A".repeat(101),
      lastName: "Smith",
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty lastName", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "",
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects lastName over 100 characters", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "B".repeat(101),
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid moveInDate format", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      moveInDate: "01-15-2023",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid moveInDate format YYYY-MM-DD", () => {
    const result = createHomeownerInput.safeParse({
      communityId: "comm-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      moveInDate: "2023-01-15",
    });
    expect(result.success).toBe(true);
  });
});

describe("createAssessmentInput", () => {
  it("accepts valid assessment", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      unitId: "unit-1",
      period: "2026-01",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid assessment with reserve fundType", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      unitId: "unit-1",
      period: "2026-03",
      amountCents: 5000,
      fundType: "reserve",
      dueDate: "2026-03-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing unitId", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("accepts unitId", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      unitId: "unit-1",
      period: "2026-01",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects period with wrong format (YYYY-M)", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-1",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects period with full date format", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01-15",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amountCents of 0", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 0,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amountCents", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: -100,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer amountCents", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 150.5,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid fundType", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 15000,
      fundType: "other",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dueDate format", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      period: "2026-01",
      amountCents: 15000,
      fundType: "operating",
      dueDate: "01/15/2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("payDuesInput", () => {
  it("accepts valid check payment", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "check",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid card payment with successUrl and cancelUrl", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "card",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ach method", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "ach",
    });
    expect(result.success).toBe(true);
  });

  it("accepts other method", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "other",
    });
    expect(result.success).toBe(true);
  });

  it("rejects amountCents less than 1", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 0,
      method: "check",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid method", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "wire",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid successUrl", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "card",
      successUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty communityId", () => {
    const result = payDuesInput.safeParse({
      communityId: "",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "check",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty assessmentId", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "",
      homeownerId: "homeowner-1",
      amountCents: 15000,
      method: "check",
    });
    expect(result.success).toBe(false);
  });
});

// INT32 overflow guard tests
describe("int32 overflow guard — dues schemas", () => {
  const INT32_MAX = 2147483647;

  it("rejects createAssessmentInput.amountCents above INT32_MAX", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      unitId: "unit-1",
      period: "2026-01",
      amountCents: INT32_MAX + 1,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("accepts createAssessmentInput.amountCents at exactly INT32_MAX", () => {
    const result = createAssessmentInput.safeParse({
      communityId: "comm-1",
      unitId: "unit-1",
      period: "2026-01",
      amountCents: INT32_MAX,
      fundType: "operating",
      dueDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payDuesInput.amountCents above INT32_MAX", () => {
    const result = payDuesInput.safeParse({
      communityId: "comm-1",
      assessmentId: "assess-1",
      homeownerId: "homeowner-1",
      amountCents: INT32_MAX + 1,
      method: "check",
    });
    expect(result.success).toBe(false);
  });

  it("rejects createUnitInput.sqft above INT32_MAX", () => {
    const result = createUnitInput.safeParse({
      communityId: "comm-1",
      address: "123 Main St",
      sqft: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });
});
