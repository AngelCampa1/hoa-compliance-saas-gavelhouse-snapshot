import { canonicalPagePath } from "./canonical-url";

export interface LlmsTxtItem {
  title: string;
  url: string;
  description: string;
}

export interface LlmsTxtSection {
  heading: string;
  items: LlmsTxtItem[];
}

type LlmsDefaultEntry = {
  data: {
    title: string;
    description: string;
  };
};

export interface LlmsTxtManifestSection<T> {
  heading: string;
  entries: T[];
  path: string | ((entry: T) => string);
  title?: (entry: T) => string;
  description?: (entry: T) => string;
  include?: (entry: T) => boolean;
}

export interface LlmsTxtOptions {
  name: string;
  description: string;
  overview?: string;
  keyLinks?: LlmsTxtSection;
  sections: LlmsTxtSection[];
}

export function buildLlmsTxtSections<T>(
  siteUrl: string,
  manifest: readonly LlmsTxtManifestSection<T>[],
): LlmsTxtSection[] {
  const normalizedSiteUrl = siteUrl.endsWith("/")
    ? siteUrl.slice(0, -1)
    : siteUrl;

  return manifest
    .map((section) => ({
      heading: section.heading,
      items: section.entries
        .filter((entry) => section.include?.(entry) ?? true)
        .map((entry) => ({
          title: section.title?.(entry) ?? getDefaultLlmsTitle(entry),
          url: `${normalizedSiteUrl}${normalizeLlmsPath(resolveLlmsPath(section.path, entry))}`,
          description:
            section.description?.(entry) ?? getDefaultLlmsDescription(entry),
        })),
    }))
    .filter((section) => section.items.length > 0);
}

export function buildLlmsTxt(opts: LlmsTxtOptions): string {
  const lines: string[] = [];

  lines.push(`# ${opts.name}`);
  lines.push("");
  lines.push(`> ${opts.description}`);
  lines.push("");

  if (opts.overview) {
    lines.push(opts.overview);
    lines.push("");
  }

  if (opts.keyLinks && opts.keyLinks.items.length > 0) {
    lines.push(`## ${opts.keyLinks.heading}`);
    lines.push("");
    for (const item of opts.keyLinks.items) {
      lines.push(`- [${item.title}](${item.url}): ${item.description}`);
    }
    lines.push("");
  }

  const nonEmptySections = opts.sections.filter(
    (section) => section.items.length > 0,
  );

  for (const section of nonEmptySections) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    for (const item of section.items) {
      lines.push(`- [${item.title}](${item.url}): ${item.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function resolveLlmsPath<T>(
  path: string | ((entry: T) => string),
  entry: T,
): string {
  return typeof path === "function" ? path(entry) : path;
}

function normalizeLlmsPath(path: string): string {
  return canonicalPagePath(path);
}

function getDefaultLlmsTitle<T>(entry: T): string {
  if (hasLlmsEntryData(entry)) {
    return entry.data.title;
  }

  throw new Error(
    "Llms manifest entries without data.title require an explicit title resolver.",
  );
}

function getDefaultLlmsDescription<T>(entry: T): string {
  if (hasLlmsEntryData(entry)) {
    return entry.data.description;
  }

  throw new Error(
    "Llms manifest entries without data.description require an explicit description resolver.",
  );
}

function hasLlmsEntryData<T>(entry: T): entry is T & LlmsDefaultEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "data" in entry &&
    typeof entry.data === "object" &&
    entry.data !== null &&
    "title" in entry.data &&
    "description" in entry.data
  );
}
