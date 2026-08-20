import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { canonicalPagePath } from "./canonical-url";

type CollectionEntry = {
  dir: string;
  prefix: string;
};

// NOTE: The"/hoa-compliance/" prefix for state pages is Gavelhouse-specific.
// Other sites that copy this file must update the prefix to match their own
// state-page route pattern (e.g.,"/hvac-software/" for a HVAC site).
const COLLECTION_ROUTE_MAP: CollectionEntry[] = [
  { dir: "alternatives", prefix: "/compare/alternatives/" },
  { dir: "comparisons", prefix: "/compare/versus/" },
  { dir: "pricing-breakdowns", prefix: "/compare/pricing/" },
  { dir: "listicles", prefix: "/resources/best/" },
  { dir: "guides", prefix: "/resources/guides/" },
  { dir: "state-pages", prefix: "/hoa-compliance/" },
  { dir: "lead-magnets", prefix: "/free/" },
  { dir: "product-pages", prefix: "/product/" },
  { dir: "solutions", prefix: "/solutions/" },
];

// Privacy, Terms, DPA, and Subprocessors are intentionally indexable —
// they serve as trust signals and are expected by SEO crawlers and buyers.
export const STATIC_NOINDEX_PATHS = ["/unsubscribed/"] as const;

/**
 * Reads all content collection markdown files and returns a Set of URL paths
 * for pages that have `noindex: true` in their frontmatter.
 *
 * @param contentDir - Absolute path to the content directory (defaults to
 *   `src/content` relative to the process cwd, which is the site root during
 *   `astro build`).
 */
export function getNoindexPaths(
  contentDir: string = resolve("src/content"),
): Set<string> {
  const noindexPaths = new Set<string>(STATIC_NOINDEX_PATHS);

  for (const { dir, prefix } of COLLECTION_ROUTE_MAP) {
    const dirPath = join(contentDir, dir);
    let files: string[];

    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      // Directory may not exist for this site -- skip silently.
      continue;
    }

    for (const file of files) {
      const raw = readFileSync(join(dirPath, file), "utf-8");
      const fmMatch = /^---\n([\s\S]*?)\n---/.exec(raw);
      if (!fmMatch) continue;

      const frontmatter = fmMatch[1];
      if (/^noindex:\s*true\s*$/m.test(frontmatter)) {
        const slug = file.replace(/\.md$/, "");
        noindexPaths.add(canonicalPagePath(prefix + slug));
      }
    }
  }

  return noindexPaths;
}
