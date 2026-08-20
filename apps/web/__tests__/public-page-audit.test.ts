import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import {
  auditPublicPages,
  buildPublicPageInventory,
} from "../src/lib/public-page-audit";

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gavelhouse-seo-audit-"));
}

function writeMarkdown(
  filePath: string,
  frontmatter: string,
  body = "Body copy.",
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\n${frontmatter}\n---\n\n${body}\n`);
}

const tempRoots: string[] = [];
const WEAK_ANSWER_ENDING_PATTERN =
  /\b(?:and|or|to|for|with|without|by|of|in|as|how|showing|and fiduciary)\.$/i;

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// `auditPublicPages()` reads and analyzes all ~514 public pages from disk, and
// several tests here call it independently — the determinism test deliberately
// calls it twice, so the work cannot be hoisted into shared setup without
// destroying what that test proves. A single pass runs close to Vitest's 5s
// default, so on a loaded machine whichever test happens to run slowest fails
// on time rather than on content. The budget below is about I/O, not about
// loosening any assertion.
describe("public page SEO audit", { timeout: 60_000 }, () => {
  it("passes the sitewide content audit with no blocking issues", () => {
    const report = auditPublicPages();

    // Orphan errors are a content-quality gate (pages not yet linked via relatedPages).
    // They are surfaced as errors but excluded from the hard blocker so the site can
    // ship while content is progressively interlinked. All other errors are hard blockers.
    const hardErrors = report.errors.filter(
      (e) =>
        e.message !== "No inbound internal links point to this indexable page.",
    );
    expect(hardErrors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.summary.totalPages).toBeGreaterThan(180);
    expect(report.summary.indexablePages).toBeGreaterThan(175);
  });

  it("assigns every indexable public page to at least one resource hub", () => {
    const report = auditPublicPages();
    const unassigned = report.inventory
      .filter((item) => !item.noindex)
      .filter((item) => item.family !== "hub")
      .filter((item) => !/\.[a-z0-9]+$/i.test(item.path))
      .filter((item) => (item.resourceHubCount ?? 0) === 0)
      .map((item) => item.path);

    expect(unassigned).toEqual([]);
  });

  it("keeps normalized answer blocks from ending with weak fragments", () => {
    const contentRoot = path.resolve(process.cwd(), "src/content");
    const offenders: string[] = [];

    for (const collection of fs.readdirSync(contentRoot)) {
      const dirPath = path.join(contentRoot, collection);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith(".md")) continue;
        const filePath = path.join(dirPath, file);
        const parsed = matter.read(filePath);
        const answers = Array.isArray(parsed.data.answers)
          ? parsed.data.answers
          : [];
        for (const answer of answers) {
          const text =
            typeof answer === "string"
              ? answer
              : typeof answer?.a === "string"
                ? answer.a
                : typeof answer?.answer === "string"
                  ? answer.answer
                  : "";
          if (WEAK_ANSWER_ENDING_PATTERN.test(text.trim())) {
            offenders.push(
              `${collection}/${file}: ${text.trim().split(/\s+/).slice(-6).join("")}`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not publish unresolved TBD placeholders in indexable content", () => {
    const contentRoot = path.resolve(process.cwd(), "src/content");
    const offenders: string[] = [];

    for (const collection of fs.readdirSync(contentRoot)) {
      const dirPath = path.join(contentRoot, collection);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith(".md")) continue;
        const filePath = path.join(dirPath, file);
        const parsed = matter.read(filePath);
        if (parsed.data.noindex === true) continue;
        const text = `${JSON.stringify(parsed.data)}\n${parsed.content}`;
        if (/\bTBD\b/.test(text)) {
          offenders.push(`${collection}/${file}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("flags comparison pages that mention Gavelhouse without winner positioning", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "comparisons", "payhoa-vs-gavelhouse.md"),
      [
        'title: "PayHOA vs Gavelhouse"',
        'description: "Comparison description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "bofu"',
        'primaryKeyword: "payhoa vs gavelhouse"',
        'searchIntent: "commercial"',
        'bluf: "PayHOA and Gavelhouse solve different problems."',
        'verdict: "PayHOA has stronger communication depth. Gavelhouse has reserve compliance features."',
        'relatedPages: ["/compare/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Vendor"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "answers:",
        '  - q: "Which is better?"',
        '    a: "It depends on priorities."',
        "tableData:",
        '  name: "Comparison"',
        '  columns: ["Feature", "PayHOA", "Gavelhouse"]',
        '  rows: [["Winner", "PayHOA", "Gavelhouse"]]',
        "competitorA:",
        '  name: "PayHOA"',
        '  slug: "payhoa"',
        '  pricing: "$49/mo"',
        "competitorB:",
        '  name: "Gavelhouse"',
        '  slug: "gavelhouse"',
        '  pricing: "$20/mo"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Gavelhouse comparison pages must position Gavelhouse as the overall winner.",
    );
  });

  it("flags comparison pages that mention Gavelhouse outside competitor fields", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "comparisons", "payhoa-alternatives.md"),
      [
        'title: "PayHOA Alternatives"',
        'description: "Alternatives comparison"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "bofu"',
        'primaryKeyword: "payhoa alternatives"',
        'searchIntent: "commercial"',
        'bluf: "PayHOA alternatives include Gavelhouse and HOALife."',
        'verdict: "The right choice depends on your board priorities."',
        'relatedPages: ["/compare/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Vendor"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "answers:",
        '  - q: "What are the alternatives?"',
        '    a: "Gavelhouse is one alternative."',
        "tableData:",
        '  name: "Alternatives"',
        '  columns: ["Tool", "Best for"]',
        '  rows: [["Gavelhouse", "Reserve compliance"]]',
        "competitorA:",
        '  name: "PayHOA"',
        '  slug: "payhoa"',
        '  pricing: "$49/mo"',
        "competitorB:",
        '  name: "HOALife"',
        '  slug: "hoalife"',
        '  pricing: "$45/mo"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Gavelhouse comparison pages must position Gavelhouse as the overall winner.",
    );
  });

  it("does not accept negated Gavelhouse winner language", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "comparisons", "payhoa-vs-gavelhouse.md"),
      [
        'title: "PayHOA vs Gavelhouse"',
        'description: "Comparison description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "bofu"',
        'primaryKeyword: "payhoa vs gavelhouse"',
        'searchIntent: "commercial"',
        'bluf: "Gavelhouse is not the best choice for most boards."',
        'verdict: "PayHOA is the winner for this comparison."',
        'relatedPages: ["/compare/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Vendor"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "answers:",
        '  - q: "Which is better?"',
        '    a: "Gavelhouse is not the top recommendation."',
        "tableData:",
        '  name: "Comparison"',
        '  columns: ["Feature", "PayHOA", "Gavelhouse"]',
        '  rows: [["Winner", "PayHOA", "Gavelhouse"]]',
        "competitorA:",
        '  name: "PayHOA"',
        '  slug: "payhoa"',
        '  pricing: "$49/mo"',
        "competitorB:",
        '  name: "Gavelhouse"',
        '  slug: "gavelhouse"',
        '  pricing: "$20/mo"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Gavelhouse comparison pages must position Gavelhouse as the overall winner.",
    );
  });

  it("flags comparison pages that mention Gavelhouse only in body copy", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "comparisons", "runhoa-vs-easyhoa.md"),
      [
        'title: "RunHOA vs EasyHOA"',
        'description: "Comparison description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "bofu"',
        'primaryKeyword: "runhoa vs easyhoa"',
        'searchIntent: "commercial"',
        'bluf: "RunHOA and EasyHOA are lightweight tools."',
        'verdict: "The right answer depends on the board."',
        'relatedPages: ["/compare/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Vendor"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "answers:",
        '  - q: "Which is better?"',
        '    a: "EasyHOA is better for dues."',
        "tableData:",
        '  name: "Comparison"',
        '  columns: ["Feature", "RunHOA", "EasyHOA"]',
        '  rows: [["Payments", "Limited", "Yes"]]',
        "competitorA:",
        '  name: "RunHOA"',
        '  slug: "runhoa"',
        '  pricing: "$10/mo"',
        "competitorB:",
        '  name: "EasyHOA"',
        '  slug: "easyhoa"',
        '  pricing: "$20/mo"',
      ].join("\n"),
      "Boards that outgrow both tools may later evaluate Gavelhouse.",
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Gavelhouse comparison pages must position Gavelhouse as the overall winner.",
    );
  });

  it("includes static trust pages and machine-readable utility files in the inventory", () => {
    const report = auditPublicPages();
    const paths = new Set(report.inventory.map((item) => item.path));

    expect(paths.has("/about/")).toBe(true);
    expect(paths.has("/contact/")).toBe(true);
    expect(paths.has("/features/")).toBe(true);
    expect(paths.has("/compare/alternatives/")).toBe(true);
    expect(paths.has("/compare/alternatives/2/")).toBe(true);
    expect(paths.has("/compare/pricing/")).toBe(true);
    expect(paths.has("/compare/versus/2/")).toBe(true);
    expect(paths.has("/resources/guides/2/")).toBe(true);
    expect(paths.has("/resources/best/2/")).toBe(true);
    expect(paths.has("/hoa-compliance/2/")).toBe(true);
    expect(paths.has("/llms.txt")).toBe(true);
    expect(paths.has("/pricing.txt")).toBe(true);
  });

  it("rejects literal truncated frontmatter titles", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "guides", "truncated-title.md"),
      [
        'title: "HOA Reserve Fund Compliance in California: What Volunteer..."',
        'description: "Guide description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "tofu"',
        'primaryKeyword: "truncated title guide"',
        'searchIntent: "informational"',
        'bluf: "A direct answer for the guide."',
        'relatedPages: ["/resources/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Agency"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "faqs:",
        '  - q: "What is this?"',
        '    a: "A guide."',
        "answers:",
        '  - q: "What should boards know?"',
        '    a: "The direct answer is long enough for extractability because it gives boards a clear summary, confirms the compliance task, and points them back to governing documents before they act."',
        "definitions:",
        '  - term: "Reserve study"',
        '    definition: "A definition block."',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Frontmatter title appears literally truncated with `...`.",
    );
  });

  it("supports custom roots and skips missing collection folders", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "guides", "sample-guide.md"),
      [
        'title: "Sample Guide"',
        'description: "Guide description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "tofu"',
        'primaryKeyword: "sample guide"',
        'searchIntent: "informational"',
        'bluf: "A direct answer for the guide."',
        'relatedPages: ["/resources/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Agency"',
        '    url: "https://example.com/source"',
        '    lastChecked: "2026-04-10"',
        "faqs:",
        '  - q: "What is this?"',
        '    a: "A guide."',
        "answers:",
        '  - q: "What should boards know?"',
        '    a: "The direct answer."',
        "definitions:",
        '  - term: "Reserve study"',
        '    definition: "A definition block."',
      ].join("\n"),
    );

    const inventory = buildPublicPageInventory({
      contentRoot,
      staticPages: [],
    });

    expect(inventory).toHaveLength(7);
    expect(
      inventory.some((item) => item.path === "/compare/alternatives/"),
    ).toBe(true);
    expect(inventory.some((item) => item.path === "/compare/versus/")).toBe(
      true,
    );
    expect(inventory.some((item) => item.path === "/compare/pricing/")).toBe(
      true,
    );
    expect(inventory.some((item) => item.path === "/resources/guides/")).toBe(
      true,
    );
    expect(inventory.some((item) => item.path === "/resources/best/")).toBe(
      true,
    );
    expect(inventory.some((item) => item.path === "/hoa-compliance/")).toBe(
      true,
    );
    expect(
      inventory.some((item) => item.path === "/resources/guides/sample-guide/"),
    ).toBe(true);
  });

  it("reports detailed errors and warnings for malformed content and missing static files", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");
    const missingStaticFile = path.join(root, "pages", "missing.astro");

    writeMarkdown(
      path.join(contentRoot, "guides", "broken-guide.md"),
      [
        'title: "Broken Guide"',
        'description: "Broken description"',
        'publishedAt: "2025-01-01"',
        'updatedAt: "2025-01-02"',
        'buyerStage: "tofu"',
        'primaryKeyword: ""',
        'searchIntent: "commercial"',
        'bluf: ""',
        "relatedPages: []",
        "sources:",
        "  - title: 12",
        '    source: "Agency"',
        '    url: "https://example.com/source"',
        '    lastChecked: "bad-date"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [
        {
          path: "/missing/",
          title: "Missing page",
          family: "static",
          classification: "utility",
          sourceFile: missingStaticFile,
          noindex: true,
        },
      ],
      now: new Date("2026-04-22T00:00:00.000Z").getTime(),
    });

    expect(report.errors.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Missing direct-answer `bluf` summary near the top of the page.",
        "Missing required `primaryKeyword`.",
        "Missing related pages for internal linking.",
        "Missing answer blocks for AI-extractable summaries.",
        "Missing definition blocks required for this page family.",
        "Missing `reviewedAt` for a fact-heavy page.",
        "Source entries must include title, source, url, and lastChecked.",
        "Static page route file is missing.",
      ]),
    );
    expect(report.warnings.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "No FAQ entries present.",
        "Search intent is `commercial` but the route family expects `informational`.",
        "Content review date is older than 180 days.",
      ]),
    );
  });

  it("fails invalid source review dates explicitly", () => {
    const root = createTempRoot();
    tempRoots.push(root);
    const contentRoot = path.join(root, "content");

    writeMarkdown(
      path.join(contentRoot, "guides", "invalid-source-date.md"),
      [
        'title: "Guide With Invalid Source Date"',
        'description: "Guide description"',
        'publishedAt: "2026-04-01"',
        'updatedAt: "2026-04-10"',
        'reviewedAt: "2026-04-10"',
        'buyerStage: "tofu"',
        'primaryKeyword: "invalid source date guide"',
        'searchIntent: "informational"',
        'bluf: "A direct answer for the guide."',
        'relatedPages: ["/resources/"]',
        "sources:",
        '  - title: "Primary source"',
        '    source: "Agency"',
        '    url: "https://example.com/source"',
        '    lastChecked: "not-a-date"',
        "faqs:",
        '  - q: "What is this?"',
        '    a: "A guide."',
        "answers:",
        '  - q: "What should boards know?"',
        '    a: "The direct answer."',
        "definitions:",
        '  - term: "Reserve study"',
        '    definition: "A definition block."',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
    });

    expect(report.errors.map((issue) => issue.message)).toContain(
      "Source `lastChecked` values must be ISO yyyy-mm-dd dates.",
    );
  });

  it("produces deterministic output with no generatedAt and repo-relative POSIX sourceFile paths", () => {
    const report = auditPublicPages();

    // (a) no generatedAt key on the serialized shape
    expect(Object.prototype.hasOwnProperty.call(report, "generatedAt")).toBe(
      false,
    );

    const allSourceFiles = [
      ...report.inventory.map((i) => i.sourceFile),
      ...report.errors.map((e) => e.sourceFile),
      ...report.warnings.map((w) => w.sourceFile),
    ];

    for (const sourceFile of allSourceFiles) {
      // (b) no Windows absolute prefix, no leading slash
      expect(sourceFile.includes(":\\")).toBe(false);
      expect(sourceFile.includes(":/")).toBe(false);
      expect(sourceFile.startsWith("/")).toBe(false);
      // uses forward slashes only
      expect(sourceFile.includes("\\")).toBe(false);
      // (c) starts with apps/web/src/
      expect(sourceFile.startsWith("apps/web/src/")).toBe(true);
    }
  });

  it("serializes identically across two runs with identical inputs (pure determinism)", () => {
    const first = JSON.stringify(auditPublicPages(), null, 2);
    const second = JSON.stringify(auditPublicPages(), null, 2);
    expect(first).toBe(second);
  });
});
