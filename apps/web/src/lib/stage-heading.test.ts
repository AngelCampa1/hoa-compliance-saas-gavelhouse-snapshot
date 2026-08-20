import { describe, it, expect } from "vitest";
import { stageHeading } from "./stage-heading";

describe("stageHeading", () => {
  it('returns "Go deeper" for tofu', () => {
    expect(stageHeading("tofu")).toBe("Go deeper");
  });

  it('returns "Compare options" for mofu', () => {
    expect(stageHeading("mofu")).toBe("Compare options");
  });

  it('returns "See your options" for bofu', () => {
    expect(stageHeading("bofu")).toBe("See your options");
  });

  it('returns "Keep reading" for undefined', () => {
    expect(stageHeading(undefined)).toBe("Keep reading");
  });
});
