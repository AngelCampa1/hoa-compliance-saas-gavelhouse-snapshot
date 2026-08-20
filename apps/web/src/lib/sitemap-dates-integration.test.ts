// @vitest-environment node
// This test mocks node:fs and node:url built-ins which require the node runtime.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  extractUpdatedAt,
  extractPathFromUrl,
  buildSlugDateMap,
  rewriteSitemapDates,
  sitemapDatesIntegration,
} from "./sitemap-dates-integration.js";

vi.mock("node:fs");
vi.mock("node:url");

// Use vi.mocked() for type-safe mock access
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockFileURLToPath = vi.mocked(fileURLToPath);

// contentDir as computed by the integration hook (join(process.cwd(), "src", "content"))
const CONTENT_DIR = join(process.cwd(), "src", "content");

describe("extractUpdatedAt", () => {
  it("returns null for empty content", () => {
    expect(extractUpdatedAt("")).toBeNull();
  });

  it("returns null when no frontmatter present", () => {
    const content = "# Hello\n\nSome content here.";
    expect(extractUpdatedAt(content)).toBeNull();
  });

  it("returns null when frontmatter has no updatedAt", () => {
    const content = `---
title: "My Page"
description: "Some description"
---

Content here.`;
    expect(extractUpdatedAt(content)).toBeNull();
  });

  it("returns unquoted updatedAt value", () => {
    const content = `---
title: My Page
updatedAt: 2026-03-15
---

Content here.`;
    expect(extractUpdatedAt(content)).toBe("2026-03-15");
  });

  it("returns double-quoted updatedAt value", () => {
    const content = `---
title: "My Page"
updatedAt: "2026-03-15"
---

Content here.`;
    expect(extractUpdatedAt(content)).toBe("2026-03-15");
  });

  it("returns single-quoted updatedAt value", () => {
    const content = `---
updatedAt: '2026-01-01'
---`;
    expect(extractUpdatedAt(content)).toBe("2026-01-01");
  });

  it("trims whitespace around the value", () => {
    const content = `---
updatedAt:   2026-06-20
---`;
    expect(extractUpdatedAt(content)).toBe("2026-06-20");
  });

  it("handles updatedAt as first frontmatter field", () => {
    const content = `---
updatedAt: 2025-12-31
title: Test
---`;
    expect(extractUpdatedAt(content)).toBe("2025-12-31");
  });

  it("handles updatedAt as last frontmatter field with no trailing newline", () => {
    const content = `---
title: Test
updatedAt: 2025-11-01---`;
    // malformed -- no trailing newline before closing --- but value still parseable
    expect(extractUpdatedAt(content)).toBe("2025-11-01");
  });

  it("returns null when no opening --- delimiter", () => {
    const content = `title: Test\nupdatedAt: 2026-01-01\n---`;
    expect(extractUpdatedAt(content)).toBeNull();
  });

  it("returns null when opening --- exists but no closing --- delimiter", () => {
    const content = `---\ntitle: Test\nupdatedAt: 2026-01-01\n`;
    expect(extractUpdatedAt(content)).toBeNull();
  });

  it("falls back to match[3] (unquoted) when groups 1 and 2 are absent", () => {
    // regex group 1 = double-quoted, group 2 = single-quoted, group 3 = unquoted
    const content = `---\nupdatedAt: 2026-09-01\n---`;
    expect(extractUpdatedAt(content)).toBe("2026-09-01");
  });
});

describe("extractPathFromUrl", () => {
  it("extracts full pathname (no leading/trailing slash) from a full URL", () => {
    expect(
      extractPathFromUrl(
        "https://crewroute.app/compare/alternatives/servicetitan",
      ),
    ).toBe("compare/alternatives/servicetitan");
  });

  it("extracts pathname from guide URL", () => {
    expect(
      extractPathFromUrl(
        "https://crewroute.app/resources/guides/how-to-reduce-dispatch-time",
      ),
    ).toBe("resources/guides/how-to-reduce-dispatch-time");
  });

  it("extracts pathname from comparison vs URL", () => {
    expect(
      extractPathFromUrl(
        "https://crewroute.app/compare/versus/servicetitan-vs-jobber",
      ),
    ).toBe("compare/versus/servicetitan-vs-jobber");
  });

  it("strips trailing slash", () => {
    expect(
      extractPathFromUrl(
        "https://crewroute.app/compare/alternatives/servicetitan/",
      ),
    ).toBe("compare/alternatives/servicetitan");
  });

  it("returns empty string for homepage", () => {
    expect(extractPathFromUrl("https://crewroute.app/")).toBe("");
  });

  it("handles URL with no path (bare domain)", () => {
    expect(extractPathFromUrl("https://crewroute.app")).toBe("");
  });

  it("handles deeply nested path", () => {
    expect(extractPathFromUrl("https://example.com/a/b/c/d/my-slug")).toBe(
      "a/b/c/d/my-slug",
    );
  });
});

describe("buildSlugDateMap", () => {
  it("returns empty map for empty input", () => {
    expect(buildSlugDateMap([])).toEqual({});
  });

  it("builds a map from files with updatedAt", () => {
    const files = [
      {
        slug: "servicetitan",
        content: `---\ntitle: ServiceTitan\nupdatedAt: 2026-03-15\n---\n`,
      },
      {
        slug: "jobber",
        content: `---\ntitle: Jobber\nupdatedAt: "2026-02-10"\n---\n`,
      },
    ];
    expect(buildSlugDateMap(files)).toEqual({
      servicetitan: "2026-03-15",
      jobber: "2026-02-10",
    });
  });

  it("omits files that have no updatedAt", () => {
    const files = [
      { slug: "servicetitan", content: `---\ntitle: ServiceTitan\n---\n` },
      {
        slug: "jobber",
        content: `---\ntitle: Jobber\nupdatedAt: 2026-02-10\n---\n`,
      },
    ];
    const result = buildSlugDateMap(files);
    expect(result).not.toHaveProperty("servicetitan");
    expect(result).toHaveProperty("jobber", "2026-02-10");
  });

  it("handles files with no frontmatter at all", () => {
    const files = [
      { slug: "no-frontmatter", content: "Just plain content." },
      {
        slug: "with-date",
        content: `---\nupdatedAt: 2026-01-01\n---\n`,
      },
    ];
    expect(buildSlugDateMap(files)).toEqual({ "with-date": "2026-01-01" });
  });

  it("last-writer-wins when duplicate slugs appear", () => {
    const files = [
      {
        slug: "duplicate",
        content: `---\nupdatedAt: 2026-01-01\n---\n`,
      },
      {
        slug: "duplicate",
        content: `---\nupdatedAt: 2026-06-15\n---\n`,
      },
    ];
    expect(buildSlugDateMap(files)).toEqual({ duplicate: "2026-06-15" });
  });
});

describe("rewriteSitemapDates", () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://crewroute.app/compare/alternatives/servicetitan</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://crewroute.app/resources/guides/how-to-dispatch</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://crewroute.app/</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

  it("returns unchanged XML when slugDateMap is empty", () => {
    expect(rewriteSitemapDates(sampleXml, {})).toBe(sampleXml);
  });

  it("replaces lastmod for a matching relative-path slug", () => {
    const result = rewriteSitemapDates(sampleXml, {
      "alternatives/servicetitan": "2026-03-15",
    });
    expect(result).toContain(
      "<loc>https://crewroute.app/compare/alternatives/servicetitan</loc>",
    );
    expect(result).toContain("<lastmod>2026-03-15</lastmod>");
    // Other URLs unchanged
    expect(result).toContain("<lastmod>2026-03-27T00:00:00.000Z</lastmod>");
  });

  it("replaces lastmod for multiple matching relative-path slugs", () => {
    const result = rewriteSitemapDates(sampleXml, {
      "alternatives/servicetitan": "2026-03-15",
      "guides/how-to-dispatch": "2026-02-20",
    });
    expect(result).toContain("<lastmod>2026-03-15</lastmod>");
    expect(result).toContain("<lastmod>2026-02-20</lastmod>");
    // Homepage (no matching slug in map) unchanged
    expect(result).toContain("<lastmod>2026-03-27T00:00:00.000Z</lastmod>");
  });

  it("leaves homepage lastmod unchanged when homepage slug not in map", () => {
    const result = rewriteSitemapDates(sampleXml, {});
    // Should still have the original build date for all URLs
    const matches = result.match(
      /<lastmod>2026-03-27T00:00:00\.000Z<\/lastmod>/g,
    );
    expect(matches).toHaveLength(3);
  });

  it("handles URLs with trailing slash when slug in map", () => {
    const xmlWithSlash = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url>
    <loc>https://example.com/alternatives/servicetitan/</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
  </url>
</urlset>`;
    const result = rewriteSitemapDates(xmlWithSlash, {
      "alternatives/servicetitan": "2026-01-10",
    });
    expect(result).toContain("<lastmod>2026-01-10</lastmod>");
  });

  it("does not modify <lastmod> in sitemap-index files (no <loc> matching content slugs)", () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://crewroute.app/sitemap-0.xml</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
  </sitemap>
</sitemapindex>`;
    // sitemap-0 slug doesn't match any content file
    const result = rewriteSitemapDates(indexXml, {
      "alternatives/servicetitan": "2026-01-01",
    });
    expect(result).toBe(indexXml);
  });

  it("handles empty XML string gracefully", () => {
    expect(rewriteSitemapDates("", {})).toBe("");
  });

  it("leaves url block unchanged when it has no <loc> element", () => {
    const xmlNoLoc = `<urlset><url><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;
    const result = rewriteSitemapDates(xmlNoLoc, {
      "alternatives/servicetitan": "2026-01-01",
    });
    expect(result).toBe(xmlNoLoc);
  });

  it("handles <lastmod> with different whitespace patterns", () => {
    const xml = `<url>\n  <loc>https://example.com/resources/guides/my-guide</loc>\n  <lastmod>  2026-03-27T00:00:00.000Z  </lastmod>\n</url>`;
    const result = rewriteSitemapDates(xml, {
      "guides/my-guide": "2026-01-05",
    });
    expect(result).toContain("<lastmod>2026-01-05</lastmod>");
  });

  it("does not collide when two files share the same basename in different subdirs", () => {
    const xmlWithCollision = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url>
    <loc>https://example.com/resources/guides/perimenopause-anxiety</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
  </url>
  <url>
    <loc>https://example.com/symptoms/perimenopause-anxiety</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
  </url>
</urlset>`;
    const slugMap = {
      "guides/perimenopause-anxiety": "2026-01-01",
      "symptoms/perimenopause-anxiety": "2026-02-15",
    };
    const result = rewriteSitemapDates(xmlWithCollision, slugMap);
    // Each URL must get its own date -- no collision
    expect(result).toContain(
      "<loc>https://example.com/resources/guides/perimenopause-anxiety</loc>",
    );
    expect(result).toContain(
      "<loc>https://example.com/symptoms/perimenopause-anxiety</loc>",
    );
    // guides version gets 2026-01-01
    expect(result).toContain("<lastmod>2026-01-01</lastmod>");
    // symptoms version gets 2026-02-15
    expect(result).toContain("<lastmod>2026-02-15</lastmod>");
    // They should not be identical
    const dates = [...result.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(
      (m) => m[1],
    );
    expect(dates).toContain("2026-01-01");
    expect(dates).toContain("2026-02-15");
  });

  it("buildSlugDateMap gives separate entries for same-basename files in different subdirs", () => {
    const files = [
      {
        slug: "guides/perimenopause-anxiety",
        content: `---\nupdatedAt: 2026-01-01\n---\n`,
      },
      {
        slug: "symptoms/perimenopause-anxiety",
        content: `---\nupdatedAt: 2026-02-15\n---\n`,
      },
    ];
    const map = buildSlugDateMap(files);
    expect(map["guides/perimenopause-anxiety"]).toBe("2026-01-01");
    expect(map["symptoms/perimenopause-anxiety"]).toBe("2026-02-15");
    expect(Object.keys(map)).toHaveLength(2);
  });
});

// Helper to create a mock logger
function makeMockLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// Helper to create a mock Dirent-like object
function makeDirent(name: string, parentPath: string, isFileFn = true) {
  return {
    name,
    parentPath,
    isFile: () => isFileFn,
    isDirectory: () => !isFileFn,
  };
}

describe("sitemapDatesIntegration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFileURLToPath.mockReturnValue("/fake/dist");
  });

  it("returns an integration with the correct name", () => {
    const integration = sitemapDatesIntegration();
    expect(integration.name).toBe("sitemap-dates");
    expect(integration.hooks["astro:build:done"]).toBeDefined();
  });

  it("warns and returns early when dist directory cannot be read", async () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("could not read dist directory"),
    );
  });

  it("warns and returns early when no sitemap XML files found", async () => {
    // readdirSync for dist returns files but no sitemap-*.xml
    mockReaddirSync.mockReturnValueOnce(["index.html", "robots.txt"] as never);
    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no sitemap XML files found"),
    );
  });

  it("warns and returns early when src/content directory does not exist", async () => {
    // First call: dist readdirSync -- returns sitemap files
    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml", "sitemap-index.xml"] as never)
      // Second call: content dir readdirSync -- throws
      .mockImplementationOnce(() => {
        throw new Error("ENOENT: no such file or directory");
      });
    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("src/content not found"),
    );
  });

  it("logs info and returns when no updatedAt frontmatter found", async () => {
    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("no-date.md", join(CONTENT_DIR, "alternatives")),
      ] as never);
    mockReadFileSync.mockReturnValue("---\ntitle: No Date\n---\n" as never);
    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("no updatedAt frontmatter found"),
    );
  });

  it("rewrites sitemap files and logs count when updatedAt found", async () => {
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://crewroute.app/compare/alternatives/servicetitan</loc>
    <lastmod>2026-03-27T00:00:00.000Z</lastmod>
  </url>
</urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    // readFileSync: first call for the .md file, second for sitemap-0.xml
    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-03-15\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    mockWriteFileSync.mockReturnValue(undefined);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote 1 lastmod entries"),
    );
  });

  it("warns and continues when a sitemap file cannot be read", async () => {
    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    // First readFileSync is the .md file, second is sitemap -- throws
    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-03-15\n---\n" as never)
      .mockImplementationOnce(() => {
        throw new Error("ENOENT");
      });

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("could not read sitemap-0.xml"),
    );
  });

  it("skips non-.md entries in content directory", async () => {
    const sitemapXml = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("README.txt", CONTENT_DIR),
        makeDirent("subdir", CONTENT_DIR, false),
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-01-15\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    mockWriteFileSync.mockReturnValue(undefined);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote"),
    );
  });

  it("skips unreadable content .md files silently", async () => {
    const sitemapXml = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("broken.md", join(CONTENT_DIR, "alternatives")),
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    // broken.md throws, servicetitan.md succeeds, then sitemap reads
    mockReadFileSync
      .mockImplementationOnce(() => {
        throw new Error("EACCES");
      })
      .mockReturnValueOnce("---\nupdatedAt: 2026-01-20\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    mockWriteFileSync.mockReturnValue(undefined);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote"),
    );
  });

  it("handles sitemap XML with no <lastmod> tags after rewrite (covers ?? [] branch)", async () => {
    // XML has <url> with slug match but no <lastmod>. rewriteSitemapDates replaces nothing
    // but we exercise the null-coalescing on match results
    const sitemapXmlNoLastmod = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-01-20\n---\n" as never)
      .mockReturnValueOnce(sitemapXmlNoLastmod as never);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    // No write since nothing changed (no <lastmod> to replace)
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote 0 lastmod entries"),
    );
  });

  it("does not write file when no dates changed", async () => {
    // Sitemap with a URL that has no matching slug in content
    const sitemapXml = `<urlset><url><loc>https://example.com/</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-01-20\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    // writeFileSync should NOT be called since nothing changed
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote 0 lastmod entries"),
    );
  });

  it("uses entry.path as fallback when parentPath is absent", async () => {
    const sitemapXml = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    // Dirent with .path instead of .parentPath (older Node API)
    const direntWithPath = {
      name: "servicetitan.md",
      path: join(CONTENT_DIR, "alternatives"),
      isFile: () => true,
      isDirectory: () => false,
    };

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([direntWithPath] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-02-10\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    mockWriteFileSync.mockReturnValue(undefined);

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote 1 lastmod entries"),
    );
  });

  it("warns and continues when writeFileSync fails with EROFS error", async () => {
    const sitemapXml = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-03-15\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    mockWriteFileSync.mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("sitemap-dates: failed to write sitemap-0.xml"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("EROFS: read-only file system"),
    );
    // Should continue without crashing, logging 0 rewritten entries
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("rewrote 0 lastmod entries"),
    );
  });

  it("warns with String() when writeFileSync throws a non-Error value", async () => {
    const sitemapXml = `<urlset><url><loc>https://example.com/alternatives/servicetitan</loc><lastmod>2026-03-27T00:00:00.000Z</lastmod></url></urlset>`;

    mockReaddirSync
      .mockReturnValueOnce(["sitemap-0.xml"] as never)
      .mockReturnValueOnce([
        makeDirent("servicetitan.md", join(CONTENT_DIR, "alternatives")),
      ] as never);

    mockReadFileSync
      .mockReturnValueOnce("---\nupdatedAt: 2026-03-15\n---\n" as never)
      .mockReturnValueOnce(sitemapXml as never);

    // Throw a non-Error value (e.g. a string) to exercise the String(err) branch
    mockWriteFileSync.mockImplementation(() => {
      throw "disk quota exceeded";
    });

    const logger = makeMockLogger();
    const integration = sitemapDatesIntegration();
    const hook = integration.hooks["astro:build:done"];
    if (!hook) throw new Error("hook not defined");
    await hook({
      dir: new URL("file:///fake/dist/"),
      logger: logger as never,
      pages: [],
      routes: [],
      assets: new Map(),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("sitemap-dates: failed to write sitemap-0.xml"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("disk quota exceeded"),
    );
  });
});
