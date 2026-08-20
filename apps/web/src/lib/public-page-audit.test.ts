import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditPublicPages,
  buildPublicPageInventory,
  type AuditInventoryItem,
} from "./public-page-audit";
import { getNoindexPaths } from "./noindex-paths";
// re-exported only for branch coverage of normalizeRelatedPagePath via the
// internal relatedPages cross-reference path in auditPublicPages

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gavelhouse-audit-"));
  tempDirs.push(dir);
  return dir;
}

function writeMarkdown(
  root: string,
  collection: string,
  slug: string,
  frontmatter: string,
): string {
  const dir = path.join(root, collection);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(filePath, `---\n${frontmatter}\n---\n`, "utf8");
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("public-page-audit", () => {
  it("builds inventory routes for every dynamic collection and sorts them", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "alternatives",
      "board-vs-payhoa",
      [
        "title: Alternative page",
        "competitor:",
        "  slug: payhoa",
        "primaryKeyword: gavelhouse alternative",
        "searchIntent: commercial",
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "comparisons",
      "gavelhouse-vs-runhoa",
      [
        "title: Comparison page",
        "competitorA:",
        "  slug: gavelhouse",
        "competitorB:",
        "  slug: runhoa",
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "pricing-breakdowns",
      "payhoa-pricing",
      "title: Pricing breakdown\nnoindex: true",
    );
    writeMarkdown(contentRoot, "listicles", "best-hoa-tools", "");
    writeMarkdown(contentRoot, "guides", "reserve-guide", "");
    writeMarkdown(contentRoot, "state-pages", "california", "");
    writeMarkdown(contentRoot, "lead-magnets", "transition-checklist", "");
    writeMarkdown(contentRoot, "product-pages", "fund-accounting", "");
    writeMarkdown(contentRoot, "solutions", "hoa-treasurer", "");

    const staticPages: AuditInventoryItem[] = [
      {
        path: "/z-static/",
        title: "Static page",
        family: "static",
        classification: "utility",
        sourceFile: "/tmp/static.astro",
        noindex: false,
      },
    ];

    const inventory = buildPublicPageInventory({ contentRoot, staticPages });

    expect(inventory.map((item) => item.path)).toEqual([
      "/compare/alternatives/",
      "/compare/alternatives/payhoa/",
      "/compare/pricing/",
      "/compare/pricing/payhoa-pricing/",
      "/compare/versus/",
      "/compare/versus/gavelhouse-vs-runhoa/",
      "/free/transition-checklist/",
      "/hoa-compliance/",
      "/hoa-compliance/california/",
      "/product/fund-accounting/",
      "/resources/best/",
      "/resources/best/best-hoa-tools/",
      "/resources/guides/",
      "/resources/guides/reserve-guide/",
      "/solutions/hoa-treasurer/",
      "/z-static/",
    ]);
    expect(
      inventory.find(
        (item) => item.path === "/compare/pricing/payhoa-pricing/",
      ),
    ).toMatchObject({
      title: "Pricing breakdown",
      noindex: true,
    });
    expect(
      inventory.find(
        (item) => item.path === "/compare/versus/gavelhouse-vs-runhoa/",
      ),
    ).toMatchObject({
      title: "Comparison page",
    });
  });

  it("skips draft content in the public inventory", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "comparisons",
      "payhoa-alternatives",
      [
        "title: Draft comparison",
        "draft: true",
        "competitorA:",
        "  slug: payhoa",
        "competitorB:",
        "  slug: gavelhouse",
      ].join("\n"),
    );

    const inventory = buildPublicPageInventory({
      contentRoot,
      staticPages: [],
    });

    expect(
      inventory.some(
        (item) => item.path === "/compare/versus/payhoa-vs-gavelhouse/",
      ),
    ).toBe(false);
  });

  it("flags duplicate indexable public paths", () => {
    const contentRoot = makeTempDir();

    for (const slug of ["first", "second"]) {
      writeMarkdown(
        contentRoot,
        "comparisons",
        slug,
        [
          `title: ${slug} comparison`,
          "description: Duplicate comparison description",
          "bluf: Duplicate route summary",
          "primaryKeyword: duplicate comparison",
          "searchIntent: commercial",
          "competitorA:",
          "  slug: payhoa",
          "competitorB:",
          "  slug: gavelhouse",
          "answers:",
          "  - answer",
          "tableData: true",
          "relatedPages:",
          "  - /compare/versus/",
          "sources:",
          "  - title: Source",
          "    source: Org",
          "    url: https://example.com/s",
          '    lastChecked: "2026-04-01"',
          'reviewedAt: "2026-04-01"',
        ].join("\n"),
      );
    }

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/compare/versus/payhoa-vs-gavelhouse/",
          message: expect.stringContaining("Indexable path is duplicated by"),
        }),
      ]),
    );
  });

  it("flags title and description metadata that ends mid-phrase", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const staticPage = path.join(staticRoot, "compare.astro");
    fs.writeFileSync(staticPage, "---", "utf8");

    writeMarkdown(
      contentRoot,
      "guides",
      "truncated-guide",
      [
        "title: HOA Software Features and",
        "description: This page compares software built for boards, not",
        "bluf: A complete answer with enough context for the audit.",
        "primaryKeyword: hoa software features",
        "searchIntent: informational",
        "answers:",
        "  - question: What should boards check?",
        "    answer: Volunteer boards should check fund accounting, owner records, payment tracking, board minutes, document storage, reserve tracking, audit history, user permissions, and export options before choosing HOA software for a self-managed community.",
        "definitions:",
        "  - term: Fund accounting",
        "    definition: Fund accounting keeps reserve money and operating money in separate ledgers.",
        "relatedPages:",
        "  - /compare/",
        "sources:",
        "  - title: Source",
        "    source: Example",
        "    url: https://example.com/source",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const result = auditPublicPages({
      contentRoot,
      publicRoot: staticRoot,
      staticPages: [
        {
          path: "/compare/",
          title: "Compare",
          family: "static",
          classification: "commercial",
          sourceFile: staticPage,
          noindex: false,
        },
      ],
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Frontmatter title appears to end mid-phrase.",
        }),
        expect.objectContaining({
          message: "Frontmatter description appears to end mid-phrase.",
        }),
      ]),
    );
  });

  it("flags description metadata that ends with a literal ellipsis", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const staticPage = path.join(staticRoot, "compare.astro");
    fs.writeFileSync(staticPage, "---", "utf8");

    writeMarkdown(
      contentRoot,
      "guides",
      "literal-description-truncation",
      [
        "title: HOA Software Features",
        "description: This page compares software for volunteer boards...",
        "bluf: A complete answer with enough context for the audit.",
        "primaryKeyword: hoa software features",
        "searchIntent: informational",
        "answers:",
        "  - question: What should boards check?",
        "    answer: Volunteer boards should check fund accounting, owner records, payment tracking, board minutes, document storage, reserve tracking, audit history, user permissions, and export options before choosing HOA software for a self-managed community.",
        "definitions:",
        "  - term: Fund accounting",
        "    definition: Fund accounting keeps reserve money and operating money in separate ledgers.",
        "relatedPages:",
        "  - /compare/",
        "sources:",
        "  - title: Source",
        "    source: Example",
        "    url: https://example.com/source",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const result = auditPublicPages({
      contentRoot,
      publicRoot: staticRoot,
      staticPages: [
        {
          path: "/compare/",
          title: "Compare",
          family: "static",
          classification: "commercial",
          sourceFile: staticPage,
          noindex: false,
        },
      ],
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Frontmatter description appears literally truncated with `...`.",
        }),
      ]),
    );
  });

  it("does not flag domain words as truncated metadata endings", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const staticPage = path.join(staticRoot, "compare.astro");
    fs.writeFileSync(staticPage, "---", "utf8");

    writeMarkdown(
      contentRoot,
      "guides",
      "reserve-guide",
      [
        "title: HOA Operating Funds and Reserve",
        "description: A plain guide for volunteer boards managing reserve",
        "bluf: A complete answer with enough context for the audit.",
        "primaryKeyword: hoa reserve guide",
        "searchIntent: informational",
        "answers:",
        "  - question: What should boards check?",
        "    answer: Volunteer boards should check fund accounting, owner records, payment tracking, board minutes, document storage, reserve tracking, audit history, user permissions, and export options before choosing HOA software for a self-managed community.",
        "definitions:",
        "  - term: Fund accounting",
        "    definition: Fund accounting keeps reserve money and operating money in separate ledgers.",
        "relatedPages:",
        "  - /compare/",
        "sources:",
        "  - title: Source",
        "    source: Example",
        "    url: https://example.com/source",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const result = auditPublicPages({
      contentRoot,
      publicRoot: staticRoot,
      staticPages: [
        {
          path: "/compare/",
          title: "Compare",
          family: "static",
          classification: "commercial",
          sourceFile: staticPage,
          noindex: false,
        },
      ],
    });

    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Frontmatter title appears to end mid-phrase.",
        }),
        expect.objectContaining({
          message: "Frontmatter description appears to end mid-phrase.",
        }),
      ]),
    );
  });

  it("audits missing metadata, invalid sources, stale pages, and missing static routes", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const existingStaticPage = path.join(staticRoot, "about.astro");
    fs.writeFileSync(existingStaticPage, "---", "utf8");

    writeMarkdown(
      contentRoot,
      "guides",
      "stale-guide",
      [
        "title: Stale guide",
        "description: Detailed guide",
        "bluf: Quick answer",
        "primaryKeyword: reserve guide",
        "searchIntent: commercial",
        "answers:",
        "  - short answer",
        "definitions:",
        "  - reserve study",
        "relatedPages:",
        "  - /compare/",
        "sources:",
        "  - title: Statute",
        "    source: State",
        "    url: https://example.com/statute",
        '    lastChecked: "2025-01-01"',
        'reviewedAt: "2025-01-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "pricing-breakdowns",
      "broken-pricing",
      [
        "title: Broken pricing",
        "description: Missing structure",
        "bluf: Pricing summary",
        "primaryKeyword: pricing comparison",
        "searchIntent: transactional",
        "sources:",
        "  - title: Broken source",
        "relatedPages:",
        "  - /compare/",
        'updatedAt: "invalid-date"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "lead-magnets",
      "missing-intent",
      [
        "title: Lead magnet",
        "description: Capture page",
        "bluf: Helpful asset",
        "primaryKeyword: hoa checklist",
        "answers:",
        "  - downloadable checklist",
        "sources:",
        "  - title: Handbook",
        "    source: Gavelhouse",
        "    url: https://example.com/handbook",
        '    lastChecked: "2026-04-01"',
        "relatedPages:",
        "  - /resources/",
        'reviewedAt: "2026-04-01"',
        "faqs:",
        "  - q: What is included?",
        "    a: A checklist.",
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "solutions",
      "missing-basics",
      ["searchIntent: commercial", "updatedAt: invalid-date"].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      now: new Date("2026-04-22T00:00:00.000Z").getTime(),
      staticPages: [
        {
          path: "/about/",
          title: "About",
          family: "static",
          classification: "utility",
          sourceFile: existingStaticPage,
          noindex: false,
        },
        {
          path: "/missing/",
          title: "Missing",
          family: "static",
          classification: "utility",
          sourceFile: path.join(staticRoot, "missing.astro"),
          noindex: true,
        },
      ],
    });

    expect(report.inventory).toHaveLength(12);
    expect(report.summary).toEqual({
      totalPages: 12,
      indexablePages: 11,
      commercialPages: 5,
      editorialPages: 5,
      utilityPages: 2,
    });

    const errorMessages = report.errors.map((issue) => issue.message);
    const warningMessages = report.warnings.map((issue) => issue.message);

    expect(errorMessages).toContain("Missing required `searchIntent`.");
    expect(errorMessages).toContain("Missing required title or description.");
    expect(errorMessages).toContain(
      "Missing direct-answer `bluf` summary near the top of the page.",
    );
    expect(errorMessages).toContain("Missing required `primaryKeyword`.");
    expect(errorMessages).toContain(
      "Missing required `sources` citations list.",
    );
    expect(errorMessages).toContain(
      "Missing related pages for internal linking.",
    );
    expect(errorMessages).toContain(
      "Missing answer blocks for AI-extractable summaries.",
    );
    expect(errorMessages).toContain(
      "Missing definition blocks required for this page family.",
    );
    expect(errorMessages).toContain(
      "Missing structured comparison/data table required for this page family.",
    );
    expect(errorMessages).toContain(
      "Missing `reviewedAt` for a fact-heavy page.",
    );
    expect(errorMessages).toContain(
      "Source entries must include title, source, url, and lastChecked.",
    );
    expect(errorMessages).toContain("Static page route file is missing.");

    expect(warningMessages).toContain("No FAQ entries present.");
    expect(warningMessages).toContain(
      "Content review date is older than 180 days.",
    );
    expect(warningMessages).toContain(
      "Search intent is `commercial` but the route family expects `informational`.",
    );
  });

  it("warns when authored meta title or description exceed SERP budgets", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "long-meta",
      [
        `title: ${"A".repeat(61)}`,
        `description: ${"B".repeat(161)}`,
        "bluf: Summary",
        "primaryKeyword: long meta guide",
        "searchIntent: informational",
        "answers:",
        "  - answer body",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
      skipOgImageCheck: true,
    });

    expect(report.warnings.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Meta title is 61 chars; will be truncated to 60.",
        "Meta description is 161 chars; will be truncated to 160.",
      ]),
    );
  });

  it("flags a non-existent ogImage path", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "missing-og",
      [
        "title: Guide",
        "description: Guide description",
        "bluf: Summary",
        "primaryKeyword: missing og guide",
        "searchIntent: informational",
        "ogImage: /og/guides/missing-og.png",
        "answers:",
        "  - answer body",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toContain(
      "Frontmatter ogImage `/og/guides/missing-og.png` does not exist at public/og/guides/missing-og.png.",
    );
  });

  it("flags duplicate primaryKeyword across indexable pages", () => {
    const contentRoot = makeTempDir();

    const shared = [
      "primaryKeyword: hoa software pricing",
      "searchIntent: commercial",
      "answers:",
      "  - answer body",
      "relatedPages:",
      "  - /compare/",
      "sources:",
      "  - title: Source",
      "    source: Org",
      "    url: https://example.com/s",
      '    lastChecked: "2026-04-01"',
      'reviewedAt: "2026-04-01"',
    ];

    writeMarkdown(
      contentRoot,
      "pricing-breakdowns",
      "alpha",
      [
        "title: Alpha",
        "description: Alpha description",
        "bluf: Alpha bluf",
        "tableData: true",
        ...shared,
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "pricing-breakdowns",
      "beta",
      [
        "title: Beta",
        "description: Beta description",
        "bluf: Beta bluf",
        "tableData: true",
        ...shared,
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    const messages = report.errors.map((e) => e.message);
    expect(
      messages.some((m) =>
        m.startsWith("primaryKeyword `hoa software pricing` collides with:"),
      ),
    ).toBe(true);
  });

  it("errors when an indexable page has no inbound internal link", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const lonelyStaticPage = path.join(staticRoot, "lonely.astro");
    fs.writeFileSync(lonelyStaticPage, "---", "utf8");

    const report = auditPublicPages({
      contentRoot,
      staticPages: [
        {
          path: "/lonely/",
          title: "Lonely",
          family: "static",
          classification: "utility",
          sourceFile: lonelyStaticPage,
          noindex: false,
        },
      ],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toContain(
      "No inbound internal links point to this indexable page.",
    );
  });

  it("does not invent root inbound links for product and solution pages without hubs", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const resourcesPage = path.join(staticRoot, "resources.astro");
    fs.writeFileSync(resourcesPage, "---", "utf8");

    const shared = [
      "description: Valid description",
      "bluf: Summary",
      "searchIntent: commercial",
      "answers:",
      "  - answer",
      "relatedPages:",
      "  - /resources/",
      "sources:",
      "  - title: Source",
      "    source: Org",
      "    url: https://example.com/s",
      '    lastChecked: "2026-04-01"',
    ];

    writeMarkdown(
      contentRoot,
      "product-pages",
      "orphan-product",
      [
        "title: Orphan product",
        "primaryKeyword: orphan product page",
        ...shared,
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "solutions",
      "orphan-solution",
      [
        "title: Orphan solution",
        "primaryKeyword: orphan solution page",
        ...shared,
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [
        {
          path: "/resources/",
          title: "Resources",
          family: "static",
          classification: "editorial",
          sourceFile: resourcesPage,
          noindex: true,
        },
      ],
      skipNoindexSyncCheck: true,
    });

    const orphanPaths = report.errors
      .filter(
        (e) =>
          e.message ===
          "No inbound internal links point to this indexable page.",
      )
      .map((e) => e.path);
    expect(orphanPaths).toEqual(
      expect.arrayContaining([
        "/product/orphan-product/",
        "/solutions/orphan-solution/",
      ]),
    );
  });

  it("errors when relatedPages references do not resolve to known public routes", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "source",
      [
        "title: Source guide",
        "description: Source description",
        "bluf: Source summary",
        "primaryKeyword: source guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - target",
        "  - /guides/old-route/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "guides",
      "target",
      [
        "title: Target guide",
        "description: Target description",
        "bluf: Target summary",
        "primaryKeyword: target guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/guides/source/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "Internal related page `target` must be an absolute path.",
        "Internal related page `/guides/old-route/` does not resolve to a known public route.",
      ]),
    );
  });

  it("accepts same-host absolute URLs and skips machine-readable file orphan checks", () => {
    const contentRoot = makeTempDir();
    const staticRoot = makeTempDir();
    const machineFile = path.join(staticRoot, "machine.txt.ts");
    fs.writeFileSync(
      machineFile,
      "export const GET = () => new Response('ok')",
      "utf8",
    );

    writeMarkdown(
      contentRoot,
      "guides",
      "source",
      [
        "title: Source guide",
        "description: Source description",
        "bluf: Source summary",
        "primaryKeyword: source absolute guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - https://gavelhouse.app/resources/guides/target/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "guides",
      "target",
      [
        "title: Target guide",
        "description: Target description",
        "bluf: Target summary",
        "primaryKeyword: target absolute guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/guides/source/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [
        {
          path: "/machine.txt",
          title: "Machine file",
          family: "static",
          classification: "utility",
          sourceFile: machineFile,
          noindex: false,
        },
      ],
      skipNoindexSyncCheck: true,
    });

    expect(
      report.errors.some((error) => error.message.includes("absolute guide")),
    ).toBe(false);
    expect(report.errors.some((error) => error.path === "/machine.txt")).toBe(
      false,
    );
  });

  it("rejects external and malformed absolute relatedPages values", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "source",
      [
        "title: Source guide",
        "description: Source description",
        "bluf: Source summary",
        "primaryKeyword: external related guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - https://example.com/not-internal/",
        "  - https://%",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "Internal related page `https://example.com/not-internal/` must be an absolute path.",
        "Internal related page `https://%` must be an absolute path.",
      ]),
    );
  });

  it("ignores non-link relatedPages values while still rejecting blocked internal schemes", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "source",
      [
        "title: Source guide",
        "description: Source description",
        "bluf: Source summary",
        "primaryKeyword: defensive related guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - 42",
        "  - ''",
        "  - mailto:hello@gavelhouse.app",
        "  - /resources/guides/target/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "guides",
      "target",
      [
        "title: Target guide",
        "description: Target description",
        "bluf: Target summary",
        "primaryKeyword: defensive target guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/guides/source/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "Internal related page `` must be an absolute path.",
        "Internal related page `mailto:hello@gavelhouse.app` must be an absolute path.",
      ]),
    );
    expect(report.errors.map((e) => e.message)).not.toContain(
      "Internal related page `42` must be an absolute path.",
    );
  });

  it("skips ogImage file check when skipOgImageCheck is true", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "skipped-og",
      [
        "title: Guide",
        "description: Guide description",
        "bluf: Summary",
        "primaryKeyword: skipped og guide",
        "searchIntent: informational",
        "ogImage: /og/guides/nonexistent.png",
        "answers:",
        "  - answer body",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [],
      skipOgImageCheck: true,
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.some((e) => e.message.includes("ogImage"))).toBe(
      false,
    );
  });

  it("does not flag a protocol-relative ogImage path", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "cdn-og",
      [
        "title: Guide",
        "description: Guide description",
        "bluf: Summary",
        "primaryKeyword: cdn og guide",
        "searchIntent: informational",
        "ogImage: //cdn.example.com/image.png",
        "answers:",
        "  - answer body",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.some((e) => e.message.includes("ogImage"))).toBe(
      false,
    );
  });

  it("accepts existing ogImage files and noindex routes that are synced with sitemap filters", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();
    const ogDir = path.join(publicRoot, "og", "guides");
    fs.mkdirSync(ogDir, { recursive: true });
    fs.writeFileSync(path.join(ogDir, "synced.png"), "png", "utf8");

    writeMarkdown(
      contentRoot,
      "guides",
      "synced",
      [
        "title: Synced guide",
        "description: Synced guide description",
        "bluf: Summary",
        "primaryKeyword: synced noindex guide",
        "searchIntent: informational",
        "noindex: true",
        "ogImage: /og/guides/synced.png",
        "answers:",
        "  - answer body",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [],
    });

    expect(report.errors.some((e) => e.message.includes("ogImage"))).toBe(
      false,
    );
    expect(
      report.errors.some(
        (e) =>
          e.message.includes("noindex") && e.message.includes("sitemap filter"),
      ),
    ).toBe(false);
  });

  it("keeps static noindex routes synced with sitemap filters", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();

    // /unsubscribed/ is the only static noindex route; trust pages are indexable.
    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [
        {
          path: "/unsubscribed/",
          title: "Unsubscribed",
          family: "static",
          classification: "utility",
          sourceFile: __filename,
          noindex: true,
        },
      ],
    });

    expect(
      report.errors.some(
        (e) =>
          e.message.includes("noindex") && e.message.includes("sitemap filter"),
      ),
    ).toBe(false);
    expect(getNoindexPaths(contentRoot).has("/unsubscribed/")).toBe(true);
    // Trust pages are intentionally indexable and must NOT be in the noindex set
    expect(getNoindexPaths(contentRoot).has("/privacy/")).toBe(false);
  });

  it("errors when a static noindex route is missing from sitemap filters", () => {
    const contentRoot = makeTempDir();
    const publicRoot = makeTempDir();

    const report = auditPublicPages({
      contentRoot,
      publicRoot,
      staticPages: [
        {
          path: "/hidden-static/",
          title: "Hidden Static Page",
          family: "static",
          classification: "utility",
          sourceFile: __filename,
          noindex: true,
        },
      ],
    });

    expect(
      report.errors.some(
        (e) =>
          e.path === "/hidden-static/" &&
          e.message.includes("noindex") &&
          e.message.includes("sitemap filter"),
      ),
    ).toBe(true);
  });

  it("normalizes relatedPages paths: no-trailing-slash reference resolves to correct target", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "page-a",
      [
        "title: Page A",
        "description: Page A description",
        "bluf: A summary",
        "primaryKeyword: page a guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - page-b-relative",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );
    writeMarkdown(
      contentRoot,
      "guides",
      "page-b",
      [
        "title: Page B",
        "description: Page B description",
        "bluf: B summary",
        "primaryKeyword: page b guide",
        "searchIntent: informational",
        "answers:",
        "  - answer",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/guides/page-a",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    const orphanErrors = report.errors.filter((w) =>
      w.message.includes("No inbound internal links"),
    );
    // page-b uses"/resources/guides/page-a" (no trailing slash) which normalizes
    // to"/resources/guides/page-a/" -- so page-a is NOT an orphan.
    expect(orphanErrors.some((w) => w.path.includes("page-a"))).toBe(false);
    expect(report.errors.map((e) => e.message)).toContain(
      "Internal related page `page-b-relative` must be an absolute path.",
    );
  });

  it("errors when noindex route URL diverges from getNoindexPaths filename slug", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "alternatives",
      "payhoa-v2",
      [
        "title: PayHOA Alt",
        "description: Alt description",
        "bluf: Alt bluf",
        "primaryKeyword: payhoa v2 alternative",
        "searchIntent: commercial",
        "noindex: true",
        "competitor:",
        "  slug: payhoa",
        "answers:",
        "  - answer",
        "tableData: true",
        "relatedPages:",
        "  - /compare/alternatives/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
    });

    expect(
      report.errors.some(
        (e) =>
          e.message.includes("noindex") && e.message.includes("sitemap filter"),
      ),
    ).toBe(true);
  });

  it("flags answer blocks outside the 40-60 word extractability range", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "short-answer",
      [
        "title: Short answer guide",
        "description: Short answer guide description",
        "bluf: Summary",
        "primaryKeyword: short answer guide",
        "searchIntent: informational",
        "answers:",
        "  - q: What is too short?",
        "    a: Too short.",
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2026-04-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.warnings.map((e) => e.message)).toContain(
      "Answer block `What is too short?` is 2 words; expected 40-60 words for AI extractability.",
    );
  });

  it("requires ISO yyyy-mm-dd dates for page and source freshness fields", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "non-iso-dates",
      [
        "title: Date guide",
        "description: Date guide description",
        "bluf: Summary",
        "primaryKeyword: date guide",
        "searchIntent: informational",
        "answers:",
        `  - ${Array(45).fill("word").join("")}`,
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "04/01/2026"',
        'updatedAt: "2026-4-1"',
        'reviewedAt: "April 1, 2026"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      skipNoindexSyncCheck: true,
    });

    expect(report.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "`updatedAt` must be an ISO yyyy-mm-dd date.",
        "`reviewedAt` must be an ISO yyyy-mm-dd date.",
        "Source `lastChecked` values must be ISO yyyy-mm-dd dates.",
      ]),
    );
  });

  it("warns when source lastChecked dates are older than 180 days", () => {
    const contentRoot = makeTempDir();

    writeMarkdown(
      contentRoot,
      "guides",
      "stale-source",
      [
        "title: Stale source guide",
        "description: Stale source guide description",
        "bluf: Summary",
        "primaryKeyword: stale source guide",
        "searchIntent: informational",
        "answers:",
        `  - ${Array(45).fill("word").join("")}`,
        "definitions:",
        "  - term",
        "relatedPages:",
        "  - /resources/",
        "sources:",
        "  - title: Source",
        "    source: Org",
        "    url: https://example.com/s",
        '    lastChecked: "2025-01-01"',
        'reviewedAt: "2026-04-01"',
      ].join("\n"),
    );

    const report = auditPublicPages({
      contentRoot,
      staticPages: [],
      now: new Date("2026-04-22T00:00:00.000Z").getTime(),
      skipNoindexSyncCheck: true,
    });

    expect(report.warnings.map((e) => e.message)).toContain(
      "Source `Source` was last checked more than 180 days ago.",
    );
  });
});
