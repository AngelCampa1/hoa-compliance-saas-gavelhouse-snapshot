import type { ContentItem, BuyerStage } from "./types";
import { deriveTitleFromHref } from "./related-page-resolver";
import { ensureTrailingSlash } from "./meta";

export function sortByUpdatedAtDesc<T extends { data: { updatedAt: string } }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.data.updatedAt).getTime() -
      new Date(a.data.updatedAt).getTime(),
  );
}

/**
 * Maps content collection entries to `ContentItem[]` for use in page templates.
 *
 * **Design note -- `relatedPages` description loss:**
 * When content frontmatter stores `relatedPages` as an array of href strings (the standard
 * schema), this function derives each `title` from the href via `deriveTitleFromHref` and
 * leaves `description` as `undefined`. This is intentional: the string-href schema carries
 * no description data, so none can be produced here.
 *
 * If you need `RelatedPage` objects with populated `description` fields, use
 * `resolveRelatedPageLinks` from `related-page-resolver.ts` together with a content map
 * that supplies the descriptions -- do not attempt to derive them from hrefs.
 */
export function mapToContentItems<
  T extends {
    data: {
      title: string;
      description: string;
      buyerStage: BuyerStage;
      publishedAt: string;
      updatedAt: string;
      relatedPages?: string[];
      targetPersona?: string[];
    };
  },
>(
  entries: T[],
  hrefBuilder: (entry: T) => string,
  metadataBuilder?: (entry: T) => Record<string, string> | undefined,
): ContentItem[] {
  return entries.map((entry) => {
    const metadata = metadataBuilder?.(entry);
    return {
      title: entry.data.title,
      description: entry.data.description,
      href: hrefBuilder(entry),
      buyerStage: entry.data.buyerStage,
      publishedAt: entry.data.publishedAt,
      updatedAt: entry.data.updatedAt,
      relatedPages: (entry.data.relatedPages ?? []).map((href) => ({
        href,
        title: deriveTitleFromHref(href),
      })),
      ...(metadata !== undefined && { metadata }),
      ...(entry.data.targetPersona !== undefined && {
        targetPersona: entry.data.targetPersona,
      }),
    };
  });
}

export function resolveCanonicalUrl(
  domain: string,
  basePath: string,
  currentPage: number,
): string {
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  const raw =
    currentPage === 1
      ? `https://${domain}${normalizedBase ||"/"}`
      : `https://${domain}${normalizedBase}/${currentPage}`;
  return ensureTrailingSlash(raw);
}

export function sumCategoryCounts(categories: { count: number }[]): number {
  return categories.reduce((sum, cat) => sum + cat.count, 0);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
