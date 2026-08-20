import { describe, expect, it } from "vitest";

import {
  isQualifiedSurveyResponse,
  matchesSurveyQualification,
} from "./survey-qualification";

describe("survey qualification helpers", () => {
  it("returns true when no qualification config is provided", () => {
    expect(matchesSurveyQualification({ role: "Anything" }, undefined)).toBe(
      true,
    );
  });

  it("returns true when any-rule qualification finds a match", () => {
    expect(
      matchesSurveyQualification(
        {
          role: "Center director",
          center_size: "1-15 children",
          pain: "Parent communication",
        },
        {
          logic: "any",
          rules: [
            { questionId: "role", answers: ["Center director", "Owner"] },
            {
              questionId: "pain",
              answers: ["Subsidy reconciliation", "Ratio compliance"],
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it("returns true when all-rule qualification fully matches", () => {
    expect(
      matchesSurveyQualification(
        {
          role: "Center director",
          center_size: "16-75 children",
          pain: "Subsidy reconciliation",
        },
        {
          logic: "all",
          rules: [
            { questionId: "role", answers: ["Center director", "Owner"] },
            {
              questionId: "center_size",
              answers: ["16-75 children", "75+ children"],
            },
            {
              questionId: "pain",
              answers: ["Subsidy reconciliation", "Ratio compliance"],
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it("returns false when qualification exists but rules are empty", () => {
    expect(matchesSurveyQualification({ role: "Owner" }, { rules: [] })).toBe(
      false,
    );
  });

  it("keeps the legacy isQualifiedSurveyResponse export aligned", () => {
    expect(
      isQualifiedSurveyResponse(
        {
          role: "In-home provider",
          center_size: "1-15 children",
        },
        {
          logic: "all",
          rules: [
            { questionId: "role", answers: ["Center director", "Owner"] },
            {
              questionId: "center_size",
              answers: ["16-75 children", "75+ children"],
            },
          ],
        },
      ),
    ).toBe(false);
  });
});
