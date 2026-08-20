import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  StartCloseInput,
  AdvanceChecklistInput,
  CLOSE_STEPS,
} from "../../src/schemas/monthEndClose.js";

describe("CLOSE_STEPS", () => {
  it("contains all five expected steps", () => {
    expect(CLOSE_STEPS).toContain("reconcile_bank");
    expect(CLOSE_STEPS).toContain("review_tb");
    expect(CLOSE_STEPS).toContain("post_adjustments");
    expect(CLOSE_STEPS).toContain("finalize_minutes");
    expect(CLOSE_STEPS).toContain("generate_pack");
    expect(CLOSE_STEPS).toHaveLength(5);
  });
});

describe("StartCloseInput", () => {
  const validInput = {
    communityId: "comm-1",
    periodYear: 2024,
    periodMonth: 12,
  };

  it("parses a valid input", () => {
    const result = StartCloseInput.parse(validInput);
    expect(result.periodYear).toBe(2024);
    expect(result.periodMonth).toBe(12);
  });

  it("rejects year below 2000", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodYear: 1999 }),
    ).toThrow(ZodError);
  });

  it("rejects year above 2100", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodYear: 2101 }),
    ).toThrow(ZodError);
  });

  it("accepts year at boundary 2000", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodYear: 2000 }),
    ).not.toThrow();
  });

  it("accepts year at boundary 2100", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodYear: 2100 }),
    ).not.toThrow();
  });

  it("rejects month below 1", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodMonth: 0 }),
    ).toThrow(ZodError);
  });

  it("rejects month above 12", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodMonth: 13 }),
    ).toThrow(ZodError);
  });

  it("accepts month at boundary 1", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodMonth: 1 }),
    ).not.toThrow();
  });

  it("accepts month at boundary 12", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodMonth: 12 }),
    ).not.toThrow();
  });

  it("rejects non-integer periodYear", () => {
    expect(() =>
      StartCloseInput.parse({ ...validInput, periodYear: 2024.5 }),
    ).toThrow(ZodError);
  });

  it("rejects missing communityId", () => {
    const { communityId: _, ...rest } = validInput;
    expect(() => StartCloseInput.parse(rest)).toThrow(ZodError);
  });
});

describe("AdvanceChecklistInput", () => {
  const validInput = {
    communityId: "comm-1",
    closeId: "close-1",
    step: "reconcile_bank" as const,
    completed: true,
  };

  it("parses a valid input with completed=true", () => {
    const result = AdvanceChecklistInput.parse(validInput);
    expect(result.step).toBe("reconcile_bank");
    expect(result.completed).toBe(true);
  });

  it("parses a valid input with completed=false", () => {
    const result = AdvanceChecklistInput.parse({
      ...validInput,
      completed: false,
    });
    expect(result.completed).toBe(false);
  });

  it("accepts all valid step values", () => {
    for (const step of CLOSE_STEPS) {
      expect(() =>
        AdvanceChecklistInput.parse({ ...validInput, step }),
      ).not.toThrow();
    }
  });

  it("rejects an invalid step", () => {
    expect(() =>
      AdvanceChecklistInput.parse({ ...validInput, step: "invalid_step" }),
    ).toThrow(ZodError);
  });

  it("rejects missing closeId", () => {
    const { closeId: _, ...rest } = validInput;
    expect(() => AdvanceChecklistInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing completed", () => {
    const { completed: _, ...rest } = validInput;
    expect(() => AdvanceChecklistInput.parse(rest)).toThrow(ZodError);
  });
});
