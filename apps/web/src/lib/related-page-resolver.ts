import { ensureTrailingSlash } from "./meta";

export type ContentMapEntry = {
  title: string;
  description: string;
  canonicalHref?: string;
};
export type ContentMap = Map<string, ContentMapEntry>;

export type ResolvedPageLink = {
  title: string;
  href: string;
  description: string;
};

export function deriveTitleFromHref(href: string): string {
  const segments = href.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return href;
  }
  const lastSegment = segments[segments.length - 1];
  return lastSegment.replace(/-/g, " ");
}

export function resolveRelatedPageLinks(
  hrefs: string[],
  contentMap: ContentMap,
): ResolvedPageLink[] {
  return hrefs.map((href) => {
    const normalized = href.endsWith("/") ? href.slice(0, -1) : href;
    const entry = contentMap.get(normalized);
    if (entry !== undefined) {
      return {
        title: entry.title,
        href: ensureTrailingSlash(entry.canonicalHref ?? href),
        description: entry.description,
      };
    }
    return {
      title: deriveTitleFromHref(href),
      href: ensureTrailingSlash(href),
      description: "",
    };
  });
}
