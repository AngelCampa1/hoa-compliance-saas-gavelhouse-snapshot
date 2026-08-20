import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IndexNowPayload, IndexNowResult } from "./indexnow.js";
import * as indexnow from "./indexnow.js";
import { indexNowIntegration } from "./indexnow-integration.js";

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://crewroute.app/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;

const SITEMAP_0_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://crewroute.app/</loc></url>
  <url><loc>https://crewroute.app/pricing</loc></url>
</urlset>`;

const SITEMAP_1_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://crewroute.app/blog</loc></url>
  <url><loc>https://crewroute.app/about</loc></url>
</urlset>`;

describe("indexNowIntegration", () => {
  let testDir: string;
  let dir: URL;
  let logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let submitSpy: MockInstance<
    (
      payload: IndexNowPayload,
      fetchFn?: typeof fetch,
    ) => Promise<IndexNowResult>
  >;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `indexnow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    dir = pathToFileURL(testDir +"/");
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    submitSpy = vi
      .spyOn(indexnow, "submitToIndexNow")
      .mockResolvedValue({ success: true, status: 200, message: "OK" });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    submitSpy.mockRestore();
  });

  async function invokeHook(
    overrideDir?: URL,
    opts?: Parameters<typeof indexNowIntegration>[0],
  ) {
    const integration = indexNowIntegration(opts);
    const hook = integration.hooks["astro:build:done"]!;
    await hook({
      dir: overrideDir ?? dir,
      logger,
      pages: [],
      routes: [],
    } as unknown as Parameters<typeof hook>[0]);
  }

  it("has the correct integration name", () => {
    const integration = indexNowIntegration();
    expect(integration.name).toBe("gavelhouse-indexnow");
  });

  it("skips submission when disabled", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);

    await invokeHook(undefined, { enabled: false });

    expect(logger.info).toHaveBeenCalledWith(
      "IndexNow: submission disabled, skipping",
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("calls logger.warn and returns when sitemap-index.xml is missing", async () => {
    // No files written -- sitemap-index.xml does not exist
    await invokeHook();

    expect(logger.warn).toHaveBeenCalledWith(
      "IndexNow: no sitemap-index.xml found, skipping submission",
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("calls logger.warn when sitemap-index.xml has no child sitemaps", async () => {
    writeFileSync(
      join(testDir, "sitemap-index.xml"),
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>`,
    );

    await invokeHook();

    expect(logger.warn).toHaveBeenCalledWith(
      "IndexNow: no sitemaps found in sitemap-index.xml",
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("collects URLs from all child sitemaps and submits them to IndexNow", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);

    await invokeHook();

    expect(submitSpy).toHaveBeenCalledOnce();
    const payload = submitSpy.mock.calls[0][0] as IndexNowPayload;
    expect(payload.urlList).toContain("https://crewroute.app/");
    expect(payload.urlList).toContain("https://crewroute.app/pricing");
  });

  it("logs the URL count and host before submitting", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);

    await invokeHook();

    expect(logger.info).toHaveBeenCalledWith(
      "IndexNow: submitting 2 URLs for crewroute.app",
    );
  });

  it("logs success message when submission succeeds (status 200)", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);

    submitSpy.mockResolvedValue({ success: true, status: 200, message: "OK" });

    await invokeHook();

    expect(logger.info).toHaveBeenCalledWith(
      "IndexNow: submitted successfully (200)",
    );
  });

  it("logs warning when submission fails (non-200)", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);

    submitSpy.mockResolvedValue({
      success: false,
      status: 422,
      message: "Unprocessable Entity",
    });

    await invokeHook();

    expect(logger.warn).toHaveBeenCalledWith(
      "IndexNow: submission failed (422: Unprocessable Entity)",
    );
  });

  it("logs warning but continues when a child sitemap file can't be read", async () => {
    writeFileSync(join(testDir, "sitemap-index.xml"), SITEMAP_INDEX_XML);
    // sitemap-0.xml is intentionally NOT written

    await invokeHook();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("IndexNow: could not read"),
    );
    // No URLs collected → submitToIndexNow should NOT be called (falls into "no URLs" branch)
    expect(logger.warn).toHaveBeenCalledWith(
      "IndexNow: no URLs found in sitemaps",
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("handles a sitemap-index.xml with multiple child sitemaps", async () => {
    const multiIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://crewroute.app/sitemap-0.xml</loc></sitemap>
  <sitemap><loc>https://crewroute.app/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

    writeFileSync(join(testDir, "sitemap-index.xml"), multiIndexXml);
    writeFileSync(join(testDir, "sitemap-0.xml"), SITEMAP_0_XML);
    writeFileSync(join(testDir, "sitemap-1.xml"), SITEMAP_1_XML);

    await invokeHook();

    expect(submitSpy).toHaveBeenCalledOnce();
    const payload = submitSpy.mock.calls[0][0] as IndexNowPayload;
    expect(payload.urlList).toHaveLength(4);
    expect(payload.urlList).toContain("https://crewroute.app/");
    expect(payload.urlList).toContain("https://crewroute.app/pricing");
    expect(payload.urlList).toContain("https://crewroute.app/blog");
    expect(payload.urlList).toContain("https://crewroute.app/about");
    expect(logger.info).toHaveBeenCalledWith(
      "IndexNow: submitting 4 URLs for crewroute.app",
    );
  });
});
