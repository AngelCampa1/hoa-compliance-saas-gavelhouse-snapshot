/**
 * Derives a display/schema caption for a comparison table from its column headers.
 *
 * Takes the full headers array (where index 0 is the feature/row-label column)
 * and joins the remaining competitor columns with " vs ", appending
 * " Comparison".
 *
 * Examples:
 *   ["Feature", "A", "B", "C"] → "A vs B vs C Comparison"
 *   ["Feature", "A"]           → "A Comparison"
 *   ["Feature"] | []           → "Comparison"
 */
export function buildComparisonTableCaption(headers: string[]): string {
  const competitors = headers.slice(1);
  if (competitors.length === 0) {
    return "Comparison";
  }
  return `${competitors.join(" vs ")} Comparison`;
}
