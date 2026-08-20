import type { SurveyQualificationConfig } from "./types";

export function matchesSurveyQualification(
  answers: Record<string, string>,
  qualificationConfig?: SurveyQualificationConfig,
): boolean {
  if (!qualificationConfig) return true;
  if (qualificationConfig.rules.length === 0) return false;

  const matches = qualificationConfig.rules.map((rule) => {
    const answer = answers[rule.questionId];
    return answer !== undefined && rule.answers.includes(answer);
  });

  return qualificationConfig.logic === "all"
    ? matches.every(Boolean)
    : matches.some(Boolean);
}

export function isQualifiedSurveyResponse(
  answers: Record<string, string>,
  qualificationConfig?: SurveyQualificationConfig,
): boolean {
  return matchesSurveyQualification(answers, qualificationConfig);
}
