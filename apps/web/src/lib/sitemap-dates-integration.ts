import { readFileSync, writeFileSync, readdirSync, type Dirent } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import type { AstroIntegration } from "astro";

/**
 * Extracts the `updatedAt` value from markdown frontmatter YAML.
 * Handles quoted and unquoted values. Returns null if not found.
 */
export function extractUpdatedAt(markdownContent: string): string | null {
  // Must start with ---
  if (!markdownContent.startsWith("---")) {
    return null;
  }
  // Find the closing --- delimiter
  const closingIndex = markdownContent.indexOf("---", 3);
  if (closingIndex === -1) {
    return null;
  }
  const frontmatter = markdownContent.slice(3, closingIndex);
  // Match: updatedAt: "value" | 'value' | value
  const match = frontmatter.match(
    /^updatedAt:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m,
  );
  if (!match) {
    return null;
  }
  // Exactly one of the three capture groups will be defined (the regex requires it).

  return (match[1] ?? match[2] ?? match[3])!;
}

/**
 * Extracts the pathname (without leading slash) from a full URL string.
 * e.g. "https://gavelhouse.app/compare/alternatives/servicetitan" → "compare/alternatives/servicetitan"
 * For homepage or bare domain, returns an empty string.
 */
export function extractPathFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/|\/$/g, "");
}

/**
 * Builds a relativeSlug→date map from an array of {slug, content} file objects.
 * The slug should be the file's relative path from the content root, without
 * the .md extension and using forward slashes
 * (e.g. "guides/perimenopause-anxiety" not "perimenopause-anxiety").
 * Files without `updatedAt` in frontmatter are omitted.
 */
export function buildSlugDateMap(
  files: Array<{ slug: string; content: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    const date = extractUpdatedAt(file.content);
    if (date !== null) {
      map[file.slug] = date;
    }
  }
  return map;
}

/**
 * Rewrites <lastmod> entries in sitemap XML where a URL's pathname suffix
 * matches a key in the slug→date map. Non-matching URLs are left unchanged.
 *
 * Matches by suffix: URL path "resources/guides/foo" matches slug key
 * "guides/foo" because the URL ends with that relative path.
 *
 * Uses simple string replacement -- no XML parser required since @astrojs/sitemap
 * produces a predictable format.
 */
export function rewriteSitemapDates(
  sitemapXml: string,
  slugDateMap: Record<string, string>,
): string {
  if (!sitemapXml || Object.keys(slugDateMap).length === 0) {
    return sitemapXml;
  }

  // Match each <url>...</url> block and rewrite the <lastmod> if slug matches
  return sitemapXml.replace(
    /(<url>[\s\S]*?<\/url>)/g,
    (urlBlock: string): string => {
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) {
        return urlBlock;
      }
      const urlPath = extractPathFromUrl(locMatch[1].trim());
      // Find a slug key that the URL path ends with (suffix match)
      const matchedKey = Object.keys(slugDateMap).find(
        (key) => urlPath === key || urlPath.endsWith(`/${key}`),
      );
      if (!matchedKey) {
        return urlBlock;
      }
      // matchedKey came from Object.keys(slugDateMap).find(), so date is always defined.
      const date = slugDateMap[matchedKey]!;
      // Replace <lastmod>...</lastmod> (handles whitespace inside the tag)
      return urlBlock.replace(
        /<lastmod>\s*[^<]*\s*<\/lastmod>/,
        `<lastmod>${date}</lastmod>`,
      );
    },
  );
}

/**
 * Astro integration that rewrites sitemap <lastmod> entries using
 * real content dates from markdown frontmatter `updatedAt` fields.
 *
 * Requires Node 18.17+ for readdirSync recursive option.
 */
export function sitemapDatesIntegration(): AstroIntegration {
  return {
    name: "sitemap-dates",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const distPath = fileURLToPath(dir);

        // 1. Find sitemap XML files (skip sitemap-index.xml -- only rewrite leaf sitemaps)
        let sitemapFiles: string[];
        try {
          const entries = readdirSync(distPath);
          sitemapFiles = entries.filter(
            (f) =>
              typeof f === "string" &&
              f.endsWith(".xml") &&
              f.startsWith("sitemap-") &&
              f !== "sitemap-index.xml",
          );
        } catch {
          logger.warn("sitemap-dates: could not read dist directory, skipping");
          return;
        }

        if (sitemapFiles.length === 0) {
          logger.warn(
            "sitemap-dates: no sitemap XML files found in dist, skipping",
          );
          return;
        }

        // 2. Read src/content/**/*.md and build slug→date map
        const contentDir = join(process.cwd(), "src", "content");
        let fileEntries: Dirent<string>[];
        try {
          fileEntries = readdirSync(contentDir, {
            recursive: true,
            withFileTypes: true,
            encoding: "utf-8",
          });
        } catch {
          logger.warn(
            "sitemap-dates: src/content not found, skipping lastmod rewrite",
          );
          return;
        }

        const contentFiles: Array<{ slug: string; content: string }> = [];
        for (const entry of fileEntries) {
          if (entry.isFile() && entry.name.endsWith(".md")) {
            // parentPath is available in Node 21.4+; path is the older equivalent
            const parentDir =
              "parentPath" in entry
                ? entry.parentPath
                : (entry as unknown as { path: string }).path;
            const fullPath = join(parentDir, entry.name);
            // Build relative path from content root (e.g. "guides/perimenopause-anxiety")
            // so files with the same basename in different subdirs get distinct keys.
            const relPath = relative(contentDir, fullPath);
            const slug = relPath.replace(/\.md$/, "").split(sep).join("/");
            try {
              const content = readFileSync(fullPath, "utf-8");
              contentFiles.push({ slug, content });
            } catch {
              // skip unreadable files
            }
          }
        }

        const slugDateMap = buildSlugDateMap(contentFiles);
        const matchCount = Object.keys(slugDateMap).length;

        if (matchCount === 0) {
          logger.info(
            "sitemap-dates: no updatedAt frontmatter found, skipping lastmod rewrite",
          );
          return;
        }

        // 3. Rewrite each leaf sitemap file
        let rewrittenUrls = 0;
        for (const sitemapFile of sitemapFiles) {
          const sitemapPath = join(distPath, sitemapFile);
          let xml: string;
          try {
            xml = readFileSync(sitemapPath, "utf-8");
          } catch {
            logger.warn(`sitemap-dates: could not read ${sitemapFile}`);
            continue;
          }

          const rewritten = rewriteSitemapDates(xml, slugDateMap);
          if (rewritten !== xml) {
            try {
              writeFileSync(sitemapPath, rewritten, "utf-8");
            } catch (err) {
              logger.warn(
                `sitemap-dates: failed to write ${sitemapFile}: ${err instanceof Error ? err.message : String(err)}`,
              );
              continue;
            }
            // Count how many <lastmod> entries changed by diffing the match arrays.
            // Both arrays are non-null here: rewritten !== xml guarantees a <lastmod> was replaced.
            const lastmodRe = /<lastmod>[^<]+<\/lastmod>/g;
            const originalDates = Array.from(
              xml.matchAll(lastmodRe),
              (m) => m[0],
            );
            const newDates = Array.from(
              rewritten.matchAll(lastmodRe),
              (m) => m[0],
            );
            for (let i = 0; i < originalDates.length; i++) {
              if (originalDates[i] !== newDates[i]) {
                rewrittenUrls++;
              }
            }
          }
        }

        logger.info(
          `sitemap-dates: rewrote ${rewrittenUrls} lastmod entries across ${sitemapFiles.length} sitemap file(s)`,
        );
      },
    },
  };
}
