type DraftableContentEntry = {
  data: {
    draft?: boolean;
    noindex?: boolean;
  };
};

type ComparisonEntry = {
  data: {
    competitorA: { slug: string };
    competitorB: { slug: string };
  };
};

export function isRoutableContentEntry<T extends DraftableContentEntry>(
  entry: T,
): boolean {
  return entry.data.draft !== true;
}

export function isSearchIndexableContentEntry<T extends DraftableContentEntry>(
  entry: T,
): boolean {
  return entry.data.draft !== true && entry.data.noindex !== true;
}

export function getComparisonPath(entry: ComparisonEntry): string {
  return `/compare/versus/${entry.data.competitorA.slug}-vs-${entry.data.competitorB.slug}/`;
}
