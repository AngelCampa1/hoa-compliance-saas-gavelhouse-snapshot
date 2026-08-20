import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_PRICING_PLANS,
  formatKnowledgeDiscountedDisplayPrice,
} from "@boardstack/shared";

const repoRoot = join(__dirname, "../../../..");

const scannedRoots = [
  "apps/web/src",
  "apps/api/src/emails",
  "docs",
  ".env.example",
  "packages/shared/src",
];

const bannedGavelhousePricingPatterns = [
  "$20-$99",
  "$20-$199",
  "$20-$49",
  "$20/month",
  "$20 per month",
  "$20/mo flat",
  "$20/mo per community",
  "$20/mo (Starter",
  "$20/mo for communities",
  "$35/mo for Starter",
  "$99/mo for Growth",
  "$179/mo for Scale",
  "$359/mo for Portfolio",
  "$49/month",
  "$49 per month",
  "$49/mo for 51",
  "$49/mo flat",
  "$49/mo Growth",
  "$99/mo for up to 500",
  "$99/mo for 201",
  "$99/mo Scale",
  "$49/mo for Growth",
  "$99/mo for Scale",
  "$49 for communities",
  "$99 for communities",
  "starting at twenty dollars",
  "Gavelhouse's $49/mo",
  "Gavelhouse's $17.50/mo Starter",
  "Growth tier covers up to 200 units at $49/mo",
  "Gavelhouse's Scale tier covers communities up to 500 homes at $49.50/mo",
  "| Gavelhouse only (51-200 units) | -- | $49 | $49 |",
  "$39.50/mo with Y80OFF",
  "$74.50/mo with Y80OFF",
  "$14.50/mo with Y80OFF billed annually",
  "$199/mo Portfolio",
  "$204.00 / yr",
  "$470.40/year",
  "$492.00 / yr",
  "$984.00 / yr",
  "$1,990",
  "annuallynth",
  "1-month free trial",
  "30-day free trial, no credit card",
  "30-day free trial with no credit card",
  "30-day free trial requires no credit card",
  "free 30-day trial",
  "without a credit card",
  "no-credit-card",
  "no credit card",
  "card required",
  "contact sales",
  "Contact sales",
  "$49/mo (51-200 homes)",
  "$49/mo (51-200 units)",
  "$99/mo (201-500 homes)",
  "$99/mo (201-500 units)",
  "$49/mo is the full cost",
  "$99/mo ($1,188/year) for larger communities",
];

const retiredDecimalGavelhouseLaunchPrices = [
  "$14.50/mo",
  "$17.50/mo",
  "$39.50/mo",
  "$49.50/mo",
  "$74.50/mo",
  "$89.50/mo",
  "$149.50/mo",
  "$179.50/mo",
];

const mojibakePatterns = [
  "\u00c3",
  "\u00c2",
  "\ufffd",
  "\u00e2\u20ac\u2122",
  "\u00e2\u20ac\u0153",
  "\u00e2\u20ac",
  "\u00ef\u00bf\u00bd",
  "\u0413\u0453",
  "\u0413\u00b7",
  "\u0413-",
];
const textContentFilePattern =
  /\.(astro|css|html|json|md|mdx|mjs|ts|tsx|txt|yml|yaml)$/;

const bannedGlobalGavelhouseOfferPatterns = [
  "Pick a plan, start the trial",
  "Pick an annual plan, start the trial",
  "Pick an annual plan, keep the 30-day guarantee",
  "Pick an annual plan, evaluate Gavelhouse",
  "Choose a plan, start the trial",
  "picks a plan, adds a card, and starts",
  "adds a card, and starts the 30-day trial",
  "$49/mo (Growth",
  "$99/mo (Scale",
  "1-month free trial",
  "30-day free trial, no credit card",
  "30-day free trial with no credit card",
  "30-day free trial requires no credit card",
  "30 days, no credit card",
  "no CC",
  "no CC required",
  "without a credit card",
  "no-credit-card",
  "no credit card",
  "card required",
  "money-back guarantee required",
  "30-day money-back guarantee required",
];

const publicPricingRoots = [
  "apps/web/src",
  "apps/app/src/routes/signup.tsx",
  "apps/api/src/routes/aiSdrContext.ts",
  "content/linkedin",
  "docs/WRITING_GUIDE.md",
  "docs/getting-badges",
  "packages/shared/src",
];

const retiredPublicGavelhousePricePatterns = [
  "$29-$299/mo",
  "$29-$149/mo",
  "annual plans from $29/mo",
  "annual plans from $29/month",
  "annual plans from $29 / month",
  "plans start at $29/mo",
  "Plans start at $29/mo",
  "plans start at $29/month",
  "Plans start at $29/month",
  "plans from $29/month",
  "starts at $29/mo",
  "starts at $29/month",
  "Flat annual plans from $29/mo",
  "Flat annual plans from $29/month",
  "pricing starts at $29/mo",
  "pricing starts at $29/month",
  "$29/month flat",
  "$29/mo billed annually",
  "$79/mo billed annually",
  "$149/mo billed annually",
  "$299/mo billed annually",
  "$29/month billed annually",
  "$79/month billed annually",
  "$149/month billed annually",
  "$299/month billed annually",
  "$29/$79/$149/$299",
  "$29, $79, $149, and $299",
  "Starter is $29/mo",
  "Starter is $29/month",
  "Starter: $29/month",
  "Starter: $29/mo",
  "Starter at $29/mo",
  "Starter at $29/month",
  "Starter $29/month",
  "Growth is $79/mo",
  "Growth is $79/month",
  "Growth: $79/month",
  "Growth: $79/mo",
  "Growth at $79/mo",
  "Growth at $79/month",
  "Growth plan is $79/month",
  "Scale is $149/mo",
  "Scale is $149/month",
  "Scale: $149/month",
  "Scale: $149/mo",
  "Scale at $149/mo",
  "Scale at $149/month",
  "Portfolio is $299/mo",
  "Portfolio is $299/month",
  "Portfolio: $299/month",
  "Portfolio: $299/mo",
  "Portfolio at $299/mo",
  "Portfolio at $299/month",
  "Gavelhouse charges $79",
  "Gavelhouse charges $0 to set up, $79",
  "Gavelhouse lists every plan publicly. Starter $29",
  "Gavelhouse's Growth plan covers 51-200 homes at $79",
  "Gavelhouse's Growth plan is $79",
  "Gavelhouse includes reserve compliance on every plan, including Starter at $29",
  "Gavelhouse treats reserve compliance as a core feature on every plan. A 30-unit community on the $29",
  "$29 to $149/month flat",
  "$29 to $149 per month",
  "$29/month billed annually",
  "$79/month billed annually",
  "$149/month billed annually",
  "$299/month billed annually",
];

/**
 * Preserved internal history, deliberately not audited.
 *
 * `docs/engineering/qa-history/` holds dated QA, recon, and defect documents
 * kept verbatim as the record of the release-readiness process. They quote
 * pricing and trial phrasing that was accurate when written and has since been
 * retired — which is exactly what this audit exists to catch in copy that still
 * ships. Auditing a historical record against today's price list would only
 * force us to falsify the record. (These files previously sat in `recon/` and
 * `docs/qa/`, outside this audit's roots; moving them under `docs/` for
 * publication is what brought them into scope.)
 */
const PRESERVED_HISTORY_ROOT = "docs/engineering/qa-history";

function isPreservedHistory(relativePath: string): boolean {
  return relativePath.split(sep).join("/").startsWith(PRESERVED_HISTORY_ROOT);
}

function collectFiles(path: string): string[] {
  const absolute = join(repoRoot, path);
  const stats = statSync(absolute);
  if (stats.isFile()) return [absolute];

  return readdirSync(absolute).flatMap((entry) => {
    const next = join(absolute, entry);
    const nextRelative = relative(repoRoot, next);
    if (isPreservedHistory(nextRelative)) return [];
    const nextStats = statSync(next);
    if (nextStats.isDirectory()) return collectFiles(nextRelative);
    return [next];
  });
}

function hasGavelhouseContext(relativePath: string, line: string): boolean {
  return (
    line.includes("Gavelhouse") ||
    line.includes("gavelhouse.app") ||
    line.includes("STRIPE_PRICE_") ||
    relativePath.includes("infra-bootstrap") ||
    relativePath.includes("production-operator-guide") ||
    relativePath.includes("WRITING_GUIDE") ||
    relativePath.includes("roadmap") ||
    relativePath.includes("brand.ts") ||
    relativePath.includes(".env.example")
  );
}

describe("Gavelhouse pricing content audit", () => {
  it("rejects retired Gavelhouse pricing ranges and tier phrases", () => {
    const offenders: string[] = [];

    for (const file of scannedRoots.flatMap(collectFiles)) {
      const relativePath = relative(repoRoot, file);
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);

      for (const [index, line] of lines.entries()) {
        if (relativePath.endsWith("gavelhouse-pricing-content-audit.test.ts")) {
          continue;
        }
        if (!hasGavelhouseContext(relativePath, line)) continue;

        for (const pattern of bannedGavelhousePricingPatterns) {
          if (line.includes(pattern)) {
            offenders.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      }

      for (const [index, line] of lines.entries()) {
        if (relativePath.endsWith("gavelhouse-pricing-content-audit.test.ts")) {
          continue;
        }

        for (const pattern of bannedGlobalGavelhouseOfferPatterns) {
          if (line.includes(pattern)) {
            offenders.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("rejects public Gavelhouse list-price copy now that Y80OFF is the listed price", () => {
    const offenders: string[] = [];

    for (const file of publicPricingRoots.flatMap(collectFiles)) {
      const relativePath = relative(repoRoot, file);
      if (relativePath.endsWith("gavelhouse-pricing-content-audit.test.ts")) {
        continue;
      }
      if (/\.(test|spec)\.[tj]sx?$/.test(relativePath)) {
        continue;
      }

      const text = readFileSync(file, "utf8");
      const normalizedText = text.replace(/\s+/g, " ");
      for (const pattern of retiredPublicGavelhousePricePatterns) {
        if (normalizedText.includes(pattern)) {
          offenders.push(`${relativePath}: ${pattern}`);
        }
      }

      const lines = text.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const pattern of retiredPublicGavelhousePricePatterns) {
          if (line.includes(pattern)) {
            offenders.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("detects non-canonical Gavelhouse prices in comparison markdown files", () => {
    const comparisonsDir = join(repoRoot, "apps/web/src/content/comparisons");

    const canonicalPrices = new Set<string>(
      KNOWLEDGE_PRICING_PLANS.flatMap((plan) => [
        formatKnowledgeDiscountedDisplayPrice(plan.slug, "monthly"),
        formatKnowledgeDiscountedDisplayPrice(plan.slug, "annual"),
      ]),
    );

    const pricePattern = /\$\d+(?:\.\d+)?\/mo/g;
    const offenders: string[] = [];

    for (const entry of readdirSync(comparisonsDir)) {
      const filePath = join(comparisonsDir, entry);
      if (!statSync(filePath).isFile() || !entry.endsWith(".md")) continue;

      const relativePath = relative(repoRoot, filePath);
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

      for (const [index, line] of lines.entries()) {
        const lowerLine = line.toLowerCase();
        const gavelhouseIdx = lowerLine.lastIndexOf("gavelhouse");
        if (gavelhouseIdx === -1) continue;

        const matches = [...line.matchAll(pricePattern)];
        for (const match of matches) {
          // Only flag prices that appear AFTER the last "gavelhouse" mention
          // to avoid flagging competitor prices cited before Gavelhouse in the same sentence.
          if (match.index === undefined || match.index < gavelhouseIdx)
            continue;
          if (!canonicalPrices.has(match[0])) {
            offenders.push(
              `${relativePath}:${index + 1}: non-canonical price "${match[0]}" attributed to Gavelhouse`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("rejects decimal Gavelhouse limited offer prices in public copy", () => {
    const offenders: string[] = [];

    for (const file of publicPricingRoots.flatMap(collectFiles)) {
      const relativePath = relative(repoRoot, file);
      if (relativePath.endsWith("gavelhouse-pricing-content-audit.test.ts")) {
        continue;
      }
      if (/\.(test|spec)\.[tj]sx?$/.test(relativePath)) {
        continue;
      }

      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (!hasGavelhouseContext(relativePath, line)) continue;
        for (const pattern of retiredDecimalGavelhouseLaunchPrices) {
          if (line.includes(pattern)) {
            offenders.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("rejects mojibake in public content", () => {
    const offenders: string[] = [];

    for (const file of publicPricingRoots.flatMap(collectFiles)) {
      const relativePath = relative(repoRoot, file);
      if (relativePath.endsWith("gavelhouse-pricing-content-audit.test.ts")) {
        continue;
      }
      if (!textContentFilePattern.test(relativePath)) {
        continue;
      }

      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const pattern of mojibakePatterns) {
          if (line.includes(pattern)) {
            offenders.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("rejects hardcoded pricing in Gavelhouse frontmatter competitor blocks", () => {
    const comparisonsDir = join(repoRoot, "apps/web/src/content/comparisons");

    const offenders: string[] = [];

    for (const entry of readdirSync(comparisonsDir)) {
      const filePath = join(comparisonsDir, entry);
      if (!statSync(filePath).isFile() || !entry.endsWith(".md")) continue;

      const relativePath = relative(repoRoot, filePath);
      const content = readFileSync(filePath, "utf8");

      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!frontmatterMatch) continue;

      const frontmatter = frontmatterMatch[1];
      const frontmatterLines = frontmatter.split(/\r?\n/);

      let currentCompetitorBlock:
        | {
            key: string;
            startIndex: number;
            lines: string[];
          }
        | undefined;
      const competitorBlocks: {
        key: string;
        startIndex: number;
        lines: string[];
      }[] = [];

      for (const [index, line] of frontmatterLines.entries()) {
        if (/^competitor[AB]:\s*$/.test(line)) {
          if (currentCompetitorBlock !== undefined) {
            competitorBlocks.push(currentCompetitorBlock);
          }
          currentCompetitorBlock = {
            key: line.replace(/:\s*$/, ""),
            startIndex: index,
            lines: [],
          };
          continue;
        }

        if (currentCompetitorBlock !== undefined && /^\S/.test(line)) {
          competitorBlocks.push(currentCompetitorBlock);
          currentCompetitorBlock = undefined;
        }

        currentCompetitorBlock?.lines.push(line);
      }

      if (currentCompetitorBlock !== undefined) {
        competitorBlocks.push(currentCompetitorBlock);
      }

      for (const block of competitorBlocks) {
        const hasGavelhouseSlug = block.lines.some((line) =>
          /^slug:\s*['"]?gavelhouse['"]?$/.test(line.trim()),
        );
        if (!hasGavelhouseSlug) continue;

        for (const [offset, line] of block.lines.entries()) {
          if (!line.trim().startsWith("pricing:")) continue;
          offenders.push(
            `${relativePath}: frontmatter contains "pricing:" in the "slug: gavelhouse" block (line ${block.startIndex + offset + 2} of frontmatter)`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 20_000);

  it("keeps known competitor pricing breakdowns aligned with verified public pricing", () => {
    const pricingDir = join(
      repoRoot,
      "apps/web/src/content/pricing-breakdowns",
    );
    const expectedSnippetsByFile = new Map<string, string[]>([
      [
        "runhoa.md",
        [
          "$399/year flat",
          "$10-$50/mo billed annually with Y80OFF",
          "$10/mo billed annually with Y80OFF",
        ],
      ],
      [
        "propertyboss.md",
        [
          "$1.25/unit/month",
          "$100 monthly minimum",
          "12-month technology agreement",
          "https://propertyboss.com/resources/getting-started/",
        ],
      ],
      [
        "topssystems.md",
        ["$27/mo for 51-200 units, and $50/mo for 201-500 units"],
      ],
    ]);

    const forbiddenSnippetsByFile = new Map<string, string[]>([
      ["runhoa.md", ["$99/mo", "$1,188/year", "$240/year", "$588 (Growth)"]],
      [
        "propertyboss.md",
        [
          "PropertyBoss does not publish pricing",
          "pricing: quote-based",
          "$200-500+/month",
          "The $49/mo is the full cost",
          "$49/mo (51-200 homes)",
          "$99/mo (201-500 homes)",
          "public software directory listings show",
        ],
      ],
      ["topssystems.md", ["249/mo", "299/mo"]],
    ]);

    const missing: string[] = [];
    const stale: string[] = [];

    for (const [filename, snippets] of expectedSnippetsByFile) {
      const content = readFileSync(join(pricingDir, filename), "utf8");
      for (const snippet of snippets) {
        if (!content.includes(snippet)) {
          missing.push(`${filename}: missing "${snippet}"`);
        }
      }
    }

    for (const [filename, snippets] of forbiddenSnippetsByFile) {
      const content = readFileSync(join(pricingDir, filename), "utf8");
      for (const snippet of snippets) {
        if (content.includes(snippet)) {
          stale.push(`${filename}: stale "${snippet}"`);
        }
      }
    }

    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });
});
