/**
 * Minor words that stay lowercase in title case unless they are the first or
 * last word of the label (e.g. "Head to Head", "QuickBooks vs Gavelhouse").
 */
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "via",
  "with",
]);

/**
 * Converts a URL slug to a human-readable title-case label.
 * Only transforms if the string looks like a slug (contains hyphens, no spaces).
 * Leaves already-readable labels unchanged. Minor connector words ("to", "vs",
 * "and", ...) stay lowercase unless they fall first or last.
 *
 * @example
 * formatSlugAsLabel("best-apps-make-friends-adult") // "Best Apps Make Friends Adult"
 * formatSlugAsLabel("Head-to-Head")                  // "Head to Head"
 * formatSlugAsLabel("quickbooks-vs-gavelhouse")      // "Quickbooks vs Gavelhouse"
 * formatSlugAsLabel("Resources")                     // "Resources" (unchanged)
 * formatSlugAsLabel("Software Roundups")             // "Software Roundups" (unchanged)
 */
export function formatSlugAsLabel(label: string): string {
  // If label contains a space, it's already human-readable -- leave it alone
  if (label.includes(" ")) return label;
  // If it contains hyphens, convert slug to title case
  if (label.includes("-")) {
    const words = label.split("-").filter((word) => word.length > 0);
    return words
      .map((word, index) => {
        const lower = word.toLowerCase();
        const isFirst = index === 0;
        const isLast = index === words.length - 1;
        if (!isFirst && !isLast && MINOR_WORDS.has(lower)) return lower;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ")
      .replace(/\s+/g, " ") // normalise multiple spaces from empty segments
      .trim();
  }
  // Single word, no hyphens -- leave it alone (e.g., "Resources", "Home")
  return label;
}
