import type { BreadcrumbItem } from "./types";

interface BuildLeadMagnetBreadcrumbsOptions {
  title: string;
  canonicalPath: string;
  hubLabel?: string;
  hubHref?: string;
}

export function buildLeadMagnetBreadcrumbs({
  title,
  canonicalPath,
  hubLabel,
  hubHref,
}: BuildLeadMagnetBreadcrumbsOptions): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [{ label: "Home", href:"/" }];

  if (hubLabel && hubHref) {
    breadcrumbs.push({ label: hubLabel, href: hubHref });
  }

  breadcrumbs.push({ label: title, href: canonicalPath });

  return breadcrumbs;
}
