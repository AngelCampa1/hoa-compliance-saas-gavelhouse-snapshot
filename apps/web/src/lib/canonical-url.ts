export function canonicalPagePath(path: string): string {
  const trimmedPath = path.trim();
  const withLeadingSlash = trimmedPath.startsWith("/")
    ? trimmedPath
    : `/${trimmedPath}`;
  const [, pathnameWithTrailingSlashes, suffix] =
    withLeadingSlash.match(/^([^?#]*)(.*)$/)!;
  const pathname = pathnameWithTrailingSlashes.replace(/\/+$/, "") ||"/";
  const withoutMarkdownExtension = pathname.replace(/\.md$/i, "");

  if (withoutMarkdownExtension ==="/") {
    return `/${suffix}`;
  }

  if (/\.[a-z0-9]+$/i.test(withoutMarkdownExtension)) {
    return `${withoutMarkdownExtension}${suffix}`;
  }

  return `${withoutMarkdownExtension}/${suffix}`;
}

export function canonicalPageUrl(siteUrl: string, path: string): string {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  return `${normalizedSiteUrl}${canonicalPagePath(path)}`;
}
