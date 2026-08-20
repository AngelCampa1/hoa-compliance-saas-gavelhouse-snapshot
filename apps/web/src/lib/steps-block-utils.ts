export interface StepItem {
  title: string;
  content: string;
}

/**
 * Normalizes a steps array for rendering in StepsBlock.
 * Filters out steps missing a title or content string,
 * and trims whitespace from both fields.
 */
export function normalizeSteps(
  steps: { title: string; content: string }[] | undefined | null,
): StepItem[] {
  if (!steps || steps.length === 0) return [];
  return steps
    .filter(
      (s) =>
        typeof s.title === "string" &&
        s.title.trim().length > 0 &&
        typeof s.content === "string" &&
        s.content.trim().length > 0,
    )
    .map((s) => ({ title: s.title.trim(), content: s.content.trim() }));
}
