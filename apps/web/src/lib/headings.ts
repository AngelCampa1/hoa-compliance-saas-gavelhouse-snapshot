export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

export function filterTocHeadings(headings: TocHeading[]): TocHeading[] {
  return headings.filter((h) => h.depth <= 3);
}

export function shouldShowToc(headings: TocHeading[], threshold = 3): boolean {
  return filterTocHeadings(headings).length >= threshold;
}
