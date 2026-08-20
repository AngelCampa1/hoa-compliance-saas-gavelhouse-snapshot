import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  ActivationStep,
  ACTIVATION_CHECKLIST,
} from "../../src/schemas/activation.js";

describe("ActivationStep", () => {
  it("accepts all valid activation steps", () => {
    const steps = [
      "roster_imported",
      "reserve_populated",
      "compliance_acknowledged",
      "dues_batch_configured",
    ] as const;
    for (const step of steps) {
      expect(ActivationStep.parse(step)).toBe(step);
    }
  });

  it("rejects an invalid step", () => {
    expect(() => ActivationStep.parse("payment_setup")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => ActivationStep.parse("")).toThrow(ZodError);
  });
});

describe("ACTIVATION_CHECKLIST", () => {
  it("has exactly 4 items", () => {
    expect(ACTIVATION_CHECKLIST).toHaveLength(4);
  });

  it("each item has step, label, and description", () => {
    for (const item of ACTIVATION_CHECKLIST) {
      expect(typeof item.step).toBe("string");
      expect(typeof item.label).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(item.step.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("steps are unique", () => {
    const steps = ACTIVATION_CHECKLIST.map((i) => i.step);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("all steps are valid ActivationStep values", () => {
    for (const item of ACTIVATION_CHECKLIST) {
      expect(() => ActivationStep.parse(item.step)).not.toThrow();
    }
  });

  it("contains roster_imported step", () => {
    expect(
      ACTIVATION_CHECKLIST.find((i) => i.step === "roster_imported"),
    ).toBeDefined();
  });

  it("contains reserve_populated step", () => {
    expect(
      ACTIVATION_CHECKLIST.find((i) => i.step === "reserve_populated"),
    ).toBeDefined();
  });

  it("contains compliance_acknowledged step", () => {
    expect(
      ACTIVATION_CHECKLIST.find((i) => i.step === "compliance_acknowledged"),
    ).toBeDefined();
  });

  it("contains dues_batch_configured step", () => {
    expect(
      ACTIVATION_CHECKLIST.find((i) => i.step === "dues_batch_configured"),
    ).toBeDefined();
  });
});
