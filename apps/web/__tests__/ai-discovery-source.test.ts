import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("AI discovery source contracts", () => {
  it("allows current search, user-fetch, and training AI crawler tokens", () => {
    const robots = readFileSync("public/robots.txt", "utf8");

    for (const token of [
      "OAI-SearchBot",
      "GPTBot",
      "ChatGPT-User",
      "PerplexityBot",
      "ClaudeBot",
      "Claude-User",
      "Claude-SearchBot",
      "anthropic-ai",
      "Googlebot",
      "GoogleOther",
      "Google-Extended",
      "CCBot",
      "Bytespider",
    ]) {
      expect(robots).toMatch(new RegExp(`User-agent: ${token}\\r?\\nAllow: /`));
    }
  });

  it("keeps llms files and pricing.txt sitemap-discoverable", () => {
    const astroConfig = readFileSync("astro.config.mjs", "utf8");
    const auditSource = readFileSync("src/lib/public-page-audit.ts", "utf8");

    expect(astroConfig).not.toContain('noindexPages.add("/llms.txt")');
    expect(astroConfig).not.toContain('noindexPages.add("/llms-full.txt")');
    expect(astroConfig).toContain("customPages: aiDiscoveryPages");
    expect(astroConfig).toContain("PUBLIC_WEB_URL");
    expect(astroConfig).toContain("`${PUBLIC_WEB_URL}/llms.txt`");
    expect(astroConfig).toContain("`${PUBLIC_WEB_URL}/llms-full.txt`");
    expect(astroConfig).toContain("`${PUBLIC_WEB_URL}/pricing.txt`");
    expect(auditSource).toContain('path: "/llms.txt"');
    expect(auditSource).toContain('path: "/llms-full.txt"');
    expect(auditSource).toContain('path: "/pricing.txt"');
  });

  it("uses shared pricing freshness rather than a hard-coded pricing.txt date", () => {
    const pricingTxtSource = readFileSync("src/pages/pricing.txt.ts", "utf8");
    const siteConfigSource = readFileSync("src/config/site.ts", "utf8");
    const sharedKnowledgeSource = readFileSync(
      "../../packages/shared/src/knowledge/seed-data.ts",
      "utf8",
    );

    expect(pricingTxtSource).not.toContain("PRICING_TXT_UPDATED_AT");
    expect(pricingTxtSource).toContain("siteConfig.pricingUpdatedAt");
    expect(siteConfigSource).toContain("pricingUpdatedAt");
    expect(sharedKnowledgeSource).toContain("updatedAt:");
  });

  it("canonicalizes llms page URLs from Astro content ids", () => {
    const llmsSource = readFileSync("src/pages/llms.txt.ts", "utf8");
    const llmsFullSource = readFileSync("src/pages/llms-full.txt.ts", "utf8");

    for (const source of [llmsSource, llmsFullSource]) {
      expect(source).toContain(
        'import { canonicalPageUrl } from "../lib/canonical-url"',
      );
      expect(source).toContain("canonicalPageUrl(siteUrl,");
      expect(source).not.toContain("`${siteUrl}/resources/guides/${e.id}`");
      expect(source).not.toContain("`${siteUrl}/product/${e.id}`");
    }
  });
});
