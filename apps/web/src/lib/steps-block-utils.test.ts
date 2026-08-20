import { describe, it, expect } from "vitest";
import { normalizeSteps } from "./steps-block-utils";
import type { StepItem } from "./steps-block-utils";

describe("normalizeSteps", () => {
  it("returns empty array when steps is undefined", () => {
    expect(normalizeSteps(undefined)).toEqual([]);
  });

  it("returns empty array when steps is null", () => {
    expect(normalizeSteps(null)).toEqual([]);
  });

  it("returns empty array when steps is empty array", () => {
    expect(normalizeSteps([])).toEqual([]);
  });

  it("normalizes a single valid step", () => {
    const result = normalizeSteps([
      { title: "Step One", content: "Do this first." },
    ]);
    expect(result).toEqual<StepItem[]>([
      { title: "Step One", content: "Do this first." },
    ]);
  });

  it("normalizes multiple valid steps preserving order", () => {
    const input = [
      { title: "First", content: "Content A" },
      { title: "Second", content: "Content B" },
      { title: "Third", content: "Content C" },
    ];
    const result = normalizeSteps(input);
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("First");
    expect(result[1].title).toBe("Second");
    expect(result[2].title).toBe("Third");
  });

  it("trims whitespace from title", () => {
    const result = normalizeSteps([
      { title:"  Trimmed", content: "content" },
    ]);
    expect(result[0].title).toBe("Trimmed");
  });

  it("trims whitespace from content", () => {
    const result = normalizeSteps([{ title: "title", content:"  padded" }]);
    expect(result[0].content).toBe("padded");
  });

  it("filters out steps with empty title", () => {
    const input = [
      { title: "", content: "has content" },
      { title: "Valid", content: "has content" },
    ];
    const result = normalizeSteps(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Valid");
  });

  it("filters out steps with whitespace-only title", () => {
    const input = [
      { title:"", content: "has content" },
      { title: "Valid", content: "has content" },
    ];
    const result = normalizeSteps(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Valid");
  });

  it("filters out steps with empty content", () => {
    const input = [
      { title: "Step One", content: "" },
      { title: "Step Two", content: "valid content" },
    ];
    const result = normalizeSteps(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Step Two");
  });

  it("filters out steps with whitespace-only content", () => {
    const input = [
      { title: "Step One", content:"" },
      { title: "Step Two", content: "real content" },
    ];
    const result = normalizeSteps(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Step Two");
  });

  it("returns empty array when all steps are invalid", () => {
    const input = [
      { title: "", content: "" },
      { title:"", content: "" },
    ];
    expect(normalizeSteps(input)).toEqual([]);
  });

  it("preserves content with internal whitespace", () => {
    const result = normalizeSteps([
      { title: "T", content: "line one\nline two" },
    ]);
    expect(result[0].content).toBe("line one\nline two");
  });

  it("returns a new array (does not mutate input)", () => {
    const input = [{ title: "T", content: "C" }];
    const result = normalizeSteps(input);
    expect(result).not.toBe(input);
  });
});
