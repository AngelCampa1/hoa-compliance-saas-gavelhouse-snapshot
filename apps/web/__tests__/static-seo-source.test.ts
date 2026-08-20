import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function readPageSource(fileName: string): string {
  return readFileSync(resolve(ROOT, "src/pages", fileName), "utf8");
}

function readLayoutSource(fileName: string): string {
  return readFileSync(resolve(ROOT, "src/layouts", fileName), "utf8");
}

function readComponentSource(fileName: string): string {
  return readFileSync(resolve(ROOT, "src/components", fileName), "utf8");
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(astro|css|js|mjs|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function scriptBlocks(source: string): string[] {
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1],
  );
}

describe("static SEO page sources", () => {
  it("renders about page with organization schema and lighter shell options", () => {
    const source = readPageSource("about.astro");

    expect(source).toContain("SchemaMarkup");
    expect(source).toContain("organizationSchema");
    expect(source).toContain("enableScrollReveal={false}");
  });

  it("renders contact page with contact schema and lighter shell options", () => {
    const source = readPageSource("contact.astro");

    expect(source).toContain("SchemaMarkup");
    expect(source).toContain("contactSchema");
    expect(source).toContain("enableScrollReveal={false}");
  });

  it("renders public help pages from shared product help content", () => {
    const indexSource = readPageSource("help/index.astro");
    const topicSource = readPageSource("help/[slug].astro");

    expect(indexSource).toContain("PRODUCT_HELP_TOPICS");
    expect(indexSource).toContain("PRODUCT_ROLE_PATHS");
    expect(indexSource).toContain("PRODUCT_GLOSSARY");
    expect(topicSource).toContain("getStaticPaths");
    expect(topicSource).toContain("PRODUCT_HELP_TOPICS");
  });

  it("suppresses duplicate BreadcrumbList schema in layouts with identity graphs", () => {
    const layouts = [
      "article-layout.astro",
      "content-layout.astro",
      "comparison-layout.astro",
      "listicle-layout.astro",
      "pricing-breakdown-layout.astro",
    ];

    for (const layout of layouts) {
      const source = readLayoutSource(layout);
      expect(source).toContain("buildPageIdentityGraphSchemas");
      expect(source).toMatch(/<BreadcrumbNav[\s\S]*emitSchema={false}/);
    }
  });

  it("returns a real 404 for unknown resource hub routes instead of redirecting", () => {
    const source = readPageSource("resources/hubs/[slug].astro");

    expect(source).not.toContain('Astro.redirect("/404")');
    expect(source).toContain("status: 404");
  });

  it("resolves public API URLs before embedding billing scripts", () => {
    const sources = new Map([
      ["promo-bar.astro", readComponentSource("promo-bar.astro")],
      ["pricing.astro", readPageSource("pricing.astro")],
    ]);

    for (const [fileName, source] of sources) {
      expect(source, fileName).toContain("resolvePublicApiUrl");
      expect(source, fileName).not.toContain(
        "import.meta.env.PUBLIC_API_URL ??",
      );
      expect(scriptBlocks(source), fileName).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("import.meta.env.PUBLIC_API_URL"),
        ]),
      );
    }
  });

  it("keeps billing scripts wired to the sanitized public API URL", () => {
    const sources = [
      readComponentSource("promo-bar.astro"),
      readPageSource("pricing.astro"),
    ];

    for (const source of sources) {
      const billingScript = scriptBlocks(source).find((script) =>
        script.includes("/billing/limited-offer"),
      );
      expect(billingScript).toBeDefined();
      expect(billingScript).toContain("publicApiUrl");
      expect(billingScript).not.toContain("import.meta.env.PUBLIC_API_URL");
      expect(billingScript).not.toContain("querySelector<");
      expect(billingScript).not.toContain("querySelectorAll<");
      expect(billingScript).not.toContain(" as HTMLElement");
      expect(billingScript).not.toContain(": HTMLElement");
    }
  });

  it("keeps web source files free of mojibake markers", () => {
    const files = [
      ...listSourceFiles(resolve(ROOT, "src")),
      ...listSourceFiles(resolve(ROOT, "scripts")),
      ...listSourceFiles(resolve(ROOT, "__tests__")),
    ];
    const mojibakePattern =
      /\u00c3|\u00c2|\u00e2\u20ac|\u00e2\u2020|\u00e2\u201d|\ufffd/;
    const offenders = files.filter((file) =>
      mojibakePattern.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
