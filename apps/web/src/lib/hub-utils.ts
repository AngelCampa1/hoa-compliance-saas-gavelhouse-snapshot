import type { FaqItem } from "./types";
import { ensureTrailingSlash } from "./meta";

/**
 * Returns true when the faqs array has at least one item.
 * Used by ContentHub to decide whether to render FaqSection (no page restriction).
 */
export function hasHubFaqs(faqs: FaqItem[]): boolean {
  return faqs.length > 0;
}

/**
 * Returns true only on page 1 when the faqs array has at least one item.
 * Used by CategoryHub to avoid rendering duplicate FAQ content on paginated pages.
 */
export function shouldShowFaqsOnPage(
  faqs: FaqItem[],
  currentPage: number,
): boolean {
  return faqs.length > 0 && currentPage === 1;
}

export function normalizeHubCanonicalUrl(canonicalUrl: string): string {
  return ensureTrailingSlash(canonicalUrl);
}
