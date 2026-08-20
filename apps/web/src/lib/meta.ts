import type { BuyerStage, SiteConfig } from "./types";

/**
 * Ensures a URL or path ends with a trailing slash.
 * Handles query strings and hash fragments by inserting the slash before them.
 * Returns"/" for empty strings.
 */
export function ensureTrailingSlash(url: string): string {
  if (url === "") return "/";

  // Find where the path ends (before ? or #)
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");

  let pathEnd: number;
  if (queryIndex === -1 && hashIndex === -1) {
    pathEnd = url.length;
  } else if (queryIndex === -1) {
    pathEnd = hashIndex;
  } else if (hashIndex === -1) {
    pathEnd = queryIndex;
  } else {
    pathEnd = Math.min(queryIndex, hashIndex);
  }

  const path = url.slice(0, pathEnd);
  const suffix = url.slice(pathEnd);

  if (path.endsWith("/")) return url;

  return path + "/" + suffix;
}

function truncateAtWordBoundary(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const lastSpace = str.lastIndexOf(" ", maxLen - 1);
  if (lastSpace > -1) {
    return str.slice(0, lastSpace).trimEnd() + "…";
  }
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Truncates a meta title to fit within Google's SERP display limit.
 * Truncates at the last word boundary before maxLen chars and appends "…".
 * If the string fits within maxLen, returns it unchanged.
 */
export function truncateMetaTitle(title: string, maxLen = 60): string {
  return truncateAtWordBoundary(title, maxLen);
}

/**
 * Truncates a meta description to fit within Google's SERP display limit.
 * Truncates at the last word boundary before maxLen chars and appends "…".
 * If the string fits within maxLen, returns it unchanged.
 */
export function truncateMetaDescription(desc: string, maxLen = 160): string {
  return truncateAtWordBoundary(desc, maxLen);
}

export function resolveSchemaImage(
  domain: string,
  ogImage?: string,
  defaultOgImage?: string,
): string {
  if (ogImage) {
    if (ogImage.startsWith("http")) return ogImage;
    if (ogImage.startsWith("//")) return `https:${ogImage}`;
    if (ogImage.startsWith("/")) return `https://${domain}${ogImage}`;
    return ogImage;
  }
  if (defaultOgImage) {
    return `https://${domain}${defaultOgImage}`;
  }
  return `https://${domain}/og-default.png`;
}

export function buyerStageToSection(stage: BuyerStage): string {
  switch (stage) {
    case "tofu":
      return "Educational";
    case "mofu":
      return "Comparison";
    case "bofu":
      return "Product";
    default:
      return "General";
  }
}

export function resolveOgImage(
  canonicalUrl: string,
  ogImageProp?: string,
  siteUrl?: string,
): string {
  if (ogImageProp) {
    if (
      ogImageProp.startsWith("/") &&
      !ogImageProp.startsWith("//") &&
      siteUrl
    ) {
      return `${siteUrl.replace(/\/$/, "")}${ogImageProp}`;
    }
    return ogImageProp;
  }
  try {
    const siteOrigin = new URL(canonicalUrl).origin;
    return `${siteOrigin}/og-default.png`;
  } catch {
    return siteUrl
      ? `${siteUrl.replace(/\/$/, "")}/og-default.png`
      : "/og-default.png";
  }
}

export function resolveLandingTitle(
  config: Pick<SiteConfig, "name" | "tagline" | "product">,
  title?: string,
  preferCategoryTitle = false,
): string {
  if (title !== undefined) {
    return title;
  }

  const category = config.product.category.trim();
  if (preferCategoryTitle && category.length > 0) {
    return `${category} | ${config.name}`;
  }

  return `${config.name} - ${config.tagline}`;
}
