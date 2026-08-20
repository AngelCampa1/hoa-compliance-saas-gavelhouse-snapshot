import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FEATURE_PAGE_GROUPS,
  FEATURE_PAGE_SLUGS,
} from "../src/lib/product-feature-index";

const ROOT = process.cwd();
const PRODUCT_CONTENT_DIR = resolve(ROOT, "src/content/product-pages");
const BAD_PUBLIC_TEXT_PATTERN =
  /[\u2014\u00e2\u00c2\u0101\u0100\ufffd]|&mdash;|&#8212;|&#x2014;/i;

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function readProductBody(file: string): string {
  const source = readFileSync(resolve(PRODUCT_CONTENT_DIR, file), "utf8");
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match?.[1] ?? source;
}

function readProductFrontmatter(file: string): string {
  const source = readFileSync(resolve(PRODUCT_CONTENT_DIR, file), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match?.[1] ?? "";
}

function countBodyWords(markdown: string): number {
  return markdown
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

describe("feature landing page source contracts", () => {
  it("maps every feature hub card to an existing product landing page", () => {
    const files = new Set(readdirSync(PRODUCT_CONTENT_DIR));

    expect(FEATURE_PAGE_SLUGS.length).toBe(13);
    expect(new Set(FEATURE_PAGE_SLUGS).size).toBe(FEATURE_PAGE_SLUGS.length);

    for (const slug of FEATURE_PAGE_SLUGS) {
      expect(files.has(`${slug}.md`)).toBe(true);
    }
  });

  it("does not leave product feature pages unlinked from the feature hub", () => {
    const contentSlugs = readdirSync(PRODUCT_CONTENT_DIR)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort();

    expect([...FEATURE_PAGE_SLUGS].sort()).toEqual(contentSlugs);
  });

  it("keeps the feature hub content-backed and AI extractable", () => {
    const source = readSource("src/pages/features/index.astro");

    expect(source).toContain('getCollection("product-pages")');
    expect(source).toContain("FEATURE_PAGE_GROUPS");
    expect(source).toContain("buildItemListSchema");
    expect(source).toContain(">Answer<");
    expect(source).toContain("{group.title} problem");
    expect(source).toContain("{group.title} solution");
    expect(source).toContain("Open feature");
  });

  it("keeps product pages problem-first before the detailed body renders", () => {
    const source = readSource("src/pages/product/[slug].astro");
    const problemIndex = source.indexOf("Plain answer");
    const contentIndex = source.indexOf("<Content />");

    expect(problemIndex).toBeGreaterThan(-1);
    expect(problemIndex).toBeLessThan(contentIndex);
    expect(source).toContain("buildSoftwareApplicationSchema");
    expect(source).toContain("buildProductSchema");
    expect(source).toContain("schemas={[softwareSchema, productSchema]}");
  });

  it("keeps feature and product page copy free of em dashes and mojibake", () => {
    const files = [
      "src/pages/features/index.astro",
      "src/pages/product/[slug].astro",
      "src/pages/product/[...page].astro",
      "src/lib/product-feature-index.ts",
      "src/components/content-card.astro",
      "src/components/editorial-listing.astro",
      "src/components/faq-section.astro",
      "src/components/funnel-cta.astro",
      "src/components/heroes/featured-workflow-hero.astro",
      "src/components/pagination.astro",
      ...readdirSync(PRODUCT_CONTENT_DIR).map(
        (file) => `src/content/product-pages/${file}`,
      ),
    ];
    const offenders = files.filter((file) => {
      const fullPath = resolve(ROOT, file);
      if (!existsSync(fullPath)) return false;
      return BAD_PUBLIC_TEXT_PATTERN.test(readFileSync(fullPath, "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  it("treats em-dash HTML entities as blocked public text", () => {
    expect(BAD_PUBLIC_TEXT_PATTERN.test("&mdash;")).toBe(true);
    expect(BAD_PUBLIC_TEXT_PATTERN.test("&#8212;")).toBe(true);
    expect(BAD_PUBLIC_TEXT_PATTERN.test("&#x2014;")).toBe(true);
  });

  it("keeps each feature group problem-solution structured", () => {
    for (const group of FEATURE_PAGE_GROUPS) {
      expect(group.problem.length).toBeGreaterThan(20);
      expect(group.problem.length).toBeLessThanOrEqual(95);
      expect(group.solution.length).toBeGreaterThan(20);
      expect(group.solution.length).toBeLessThanOrEqual(105);
      expect(group.slugs.length).toBeGreaterThan(0);
    }
  });

  it("keeps every feature page in-depth with strong body links", () => {
    const weakPages = readdirSync(PRODUCT_CONTENT_DIR)
      .filter((file) => file.endsWith(".md"))
      .flatMap((file) => {
        const body = readProductBody(file);
        const bodyLinks = [...body.matchAll(/\]\((\/[^)#?]+\/)\)/g)].length;
        const headingCount = [...body.matchAll(/^##\s+/gm)].length;
        const wordCount = countBodyWords(body);
        const failures = [];

        if (wordCount < 450) failures.push(`only ${wordCount} body words`);
        if (headingCount < 4) failures.push(`only ${headingCount} h2 sections`);
        if (bodyLinks < 2) failures.push(`only ${bodyLinks} body links`);

        return failures.length > 0 ? [`${file}: ${failures.join(", ")}`] : [];
      });

    expect(weakPages).toEqual([]);
  });

  it("keeps product markdown from relying on smart dash conversion", () => {
    const dashPages = readdirSync(PRODUCT_CONTENT_DIR)
      .filter((file) => file.endsWith(".md"))
      .filter((file) => {
        const markdown = `${readProductFrontmatter(file)}\n${readProductBody(
          file,
        )}`;
        return markdown.includes("--");
      });

    expect(dashPages).toEqual([]);
  });
});
