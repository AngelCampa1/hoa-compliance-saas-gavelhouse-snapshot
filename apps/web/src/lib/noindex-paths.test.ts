// @vitest-environment node
// This test uses real fs mocking which requires the node runtime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";

vi.mock("fs");

const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe("getNoindexPaths", () => {
  // Only /unsubscribed/ is in STATIC_NOINDEX_PATHS; trust pages (privacy/terms/dpa/subprocessors)
  // are intentionally indexable as SEO trust signals.
  const staticNoindexCount = 1;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty set when all content directories are missing", async () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { getNoindexPaths } = await import("./noindex-paths.js");
    const result = getNoindexPaths("/fake/content");

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(staticNoindexCount);
  });

  it("returns an empty set when no files have noindex: true", async () => {
    mockReaddirSync.mockReturnValue(["page.md"] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockReturnValue("---\ntitle: A page\n---\n# Content");

    const { getNoindexPaths } = await import("./noindex-paths.js");
    expect(getNoindexPaths("/fake/content").size).toBe(staticNoindexCount);
  });

  it("returns the URL path for files with noindex: true", async () => {
    mockReaddirSync.mockReturnValue(["my-page.md"] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockReturnValue(
      "---\ntitle: A page\nnoindex: true\n---\n# Content",
    );

    const { getNoindexPaths } = await import("./noindex-paths.js");
    const result = getNoindexPaths("/fake/content");
    const paths = [...result];

    expect(result.size).toBeGreaterThan(0);
    expect(paths.some((path) => path.includes("my-page"))).toBe(true);
  });

  it("skips files without frontmatter", async () => {
    mockReaddirSync.mockReturnValue(["bare.md"] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockReturnValue("# No frontmatter here");

    const { getNoindexPaths } = await import("./noindex-paths.js");
    expect(getNoindexPaths("/fake/content").size).toBe(staticNoindexCount);
  });

  it("only picks up .md files from the directory listing", async () => {
    mockReaddirSync.mockReturnValue([
      "page.md",
      "image.png",
      "data.json",
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue("---\nnoindex: true\n---\n# Content");

    const { getNoindexPaths } = await import("./noindex-paths.js");
    expect(getNoindexPaths("/fake/content").size).toBeLessThanOrEqual(
      staticNoindexCount + 9,
    );
  });

  it("includes noindex paths for lead magnets, product pages, and solutions", async () => {
    mockReaddirSync.mockReturnValue(["hidden-page.md"] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockReturnValue("---\nnoindex: true\n---\n# Content");

    const { getNoindexPaths } = await import("./noindex-paths.js");
    const result = getNoindexPaths("/fake/content");

    expect(result.has("/free/hidden-page/")).toBe(true);
    expect(result.has("/product/hidden-page/")).toBe(true);
    expect(result.has("/solutions/hidden-page/")).toBe(true);
    expect(result.has("/free/hidden-page")).toBe(false);
  });

  it("includes /unsubscribed/ as static noindex route and excludes indexable trust pages", async () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { getNoindexPaths } = await import("./noindex-paths.js");
    const result = getNoindexPaths("/fake/content");

    // Utility page that should stay noindex (no meaningful content for SEO)
    expect(result.has("/unsubscribed/")).toBe(true);

    // Trust pages are intentionally indexable for SEO and vendor-review discovery
    expect(result.has("/privacy/")).toBe(false);
    expect(result.has("/terms/")).toBe(false);
    expect(result.has("/dpa/")).toBe(false);
    expect(result.has("/subprocessors/")).toBe(false);
  });

  it("uses the default src/content path when none is provided", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("C:/repo/apps/web");
    mockReaddirSync.mockImplementation((dirPath) => {
      expect(String(dirPath)).toContain("C:/repo/apps/web");
      throw new Error("ENOENT");
    });

    const { getNoindexPaths } = await import("./noindex-paths.js");
    expect(getNoindexPaths().size).toBe(staticNoindexCount);

    cwdSpy.mockRestore();
  });
});
