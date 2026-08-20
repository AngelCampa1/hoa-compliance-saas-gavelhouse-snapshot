/**
 * Splits rendered HTML at the Nth heading boundary to create a teaser/gated
 * content split for lead magnet pages.
 *
 * Strategy:
 * 1. Try splitting on `<h2>` boundaries first (most common in markdown-rendered content)
 * 2. If no `<h2>` found, fall back to `<h3>` boundaries
 * 3. If no headings at all, fall back to `<p>` boundaries
 * 4. If none of those exist, return everything as teaser
 */
export function splitContentAtGate(
  html: string,
  freePreviewSections: number,
): { teaser: string; gated: string } {
  if (freePreviewSections === 0) {
    return { teaser: "", gated: html };
  }

  if (!html) {
    return { teaser: "", gated: "" };
  }

  // Try h2 first, then h3, then p
  const h2Positions = findTagPositions(html, "h2");
  if (h2Positions.length > 0) {
    return splitAtPositions(html, h2Positions, freePreviewSections);
  }

  const h3Positions = findTagPositions(html, "h3");
  if (h3Positions.length > 0) {
    return splitAtPositions(html, h3Positions, freePreviewSections);
  }

  const pPositions = findTagPositions(html, "p");
  if (pPositions.length > 0) {
    return splitAtPositions(html, pPositions, freePreviewSections);
  }

  // No recognizable sections -- return everything as teaser
  return { teaser: html, gated: "" };
}

/**
 * Finds all start positions of a given opening tag in the HTML string.
 * Returns an array of character indices where `<tagName` begins.
 */
function findTagPositions(html: string, tagName: string): number[] {
  const positions: number[] = [];
  const regex = new RegExp(`<${tagName}[\\s>]`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

/**
 * Splits content at the Nth section boundary defined by tag positions.
 */
function splitAtPositions(
  html: string,
  positions: number[],
  freePreviewSections: number,
): { teaser: string; gated: string } {
  if (freePreviewSections >= positions.length) {
    return { teaser: html, gated: "" };
  }

  const splitIndex = positions[freePreviewSections];
  return {
    teaser: html.slice(0, splitIndex),
    gated: html.slice(splitIndex),
  };
}
