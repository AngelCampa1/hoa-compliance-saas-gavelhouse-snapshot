import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { getNoindexPaths } from "./noindex-paths";
import {
  FOOTER_LEGAL_LINKS,
  FOOTER_LINK_GROUPS,
  NAV_ITEMS,
  PRODUCT_HELP_TOPICS,
  BRAND_DOMAIN,
} from "@boardstack/shared";
import {
  RESOURCE_HUBS,
  getResourceHubHref,
  getResourceHubsForPath,
} from "./resource-hub-data";
import { validateAnswerLength } from "./ai-extractable";

function findRepoRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, ".git"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

export function toRepoRelativePosix(absolutePath: string): string {
  if (!REPO_ROOT) return absolutePath.replace(/\\/g, "/");
  const normalizedInput = path.resolve(absolutePath);
  const rel = path.relative(REPO_ROOT, normalizedInput);
  // If the path is outside the repo root (e.g. temp dirs in tests), leave it alone.
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return absolutePath.replace(/\\/g, "/");
  }
  return rel.split(path.sep).join("/");
}

export type PublicPageClassification = "commercial" | "editorial" | "utility";
export type PageFamily =
  | "alternatives"
  | "comparisons"
  | "pricing-breakdowns"
  | "listicles"
  | "guides"
  | "state-pages"
  | "lead-magnets"
  | "product-pages"
  | "solutions"
  | "help"
  | "hub"
  | "static";

interface CollectionRule {
  family: Exclude<PageFamily, "static" | "help">;
  classification: PublicPageClassification;
  route: (slug: string, data: Record<string, unknown>) => string;
  expectedIntent:
    | "informational"
    | "commercial"
    | "transactional"
    | "navigational";
  requireAnswers: boolean;
  requireDefinitions: boolean;
  requireTable: boolean;
  requireReviewedAt: boolean;
}

interface PaginatedHubRule {
  collection: Exclude<PageFamily, "static" | "hub" | "help">;
  path: string;
  title: string;
  sourceFile: string;
  classification: Extract<PublicPageClassification, "commercial" | "editorial">;
  pageSize: number;
}

export interface AuditInventoryItem {
  path: string;
  title: string;
  family: PageFamily;
  classification: PublicPageClassification;
  sourceFile: string;
  noindex: boolean;
  primaryKeyword?: string;
  searchIntent?: string;
  reviewedAt?: string;
  updatedAt?: string;
  relatedPagesCount?: number;
  sourcesCount?: number;
  inboundInternalLinkCount?: number;
  resourceHubCount?: number;
}

export interface AuditIssue {
  severity: "error" | "warning";
  path: string;
  sourceFile: string;
  message: string;
}

export interface PublicPageAuditReport {
  inventory: AuditInventoryItem[];
  errors: AuditIssue[];
  warnings: AuditIssue[];
  summary: {
    totalPages: number;
    indexablePages: number;
    commercialPages: number;
    editorialPages: number;
    utilityPages: number;
  };
}

const CONTENT_ROOT = path.resolve(process.cwd(), "src/content");
const PAGES_ROOT = path.resolve(process.cwd(), "src/pages");
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const DEFAULT_PAGE_SIZE = 12;
const META_TITLE_MAX_LEN = 60;
const META_DESCRIPTION_MAX_LEN = 160;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LITERAL_TRUNCATED_TITLE_PATTERN = /\.\.\.$/;
const LITERAL_TRUNCATED_DESCRIPTION_PATTERN = /\.\.\.$/;
const TRUNCATED_TITLE_END_PATTERN =
  /\b(?:and|or|to|what|why|must|not|with|in)$/i;
const TRUNCATED_DESCRIPTION_END_PATTERN =
  /\b(?:and|or|to|what|why|must|not|with|in)$/i;
const gavelhouse_WINNER_MESSAGE =
  "Gavelhouse comparison pages must position Gavelhouse as the overall winner.";
const gavelhouse_WINNER_PATTERNS = [
  /\bGavelhouse\s+(?:wins|is|remains)\s+(?:the\s+)?(?:overall\s+winner|best\s+(?:overall\s+)?choice|top recommendation|strongest choice|stronger default|better default)/i,
  /\bGavelhouse\s+is\s+(?:the\s+)?(?:stronger|better)\s+(?:fit|next step|choice)\b/i,
  /\b(?:choose|start with|use)\s+Gavelhouse\b/i,
  /\bGavelhouse\b[^.?!]*(?:wins the|wins on|wins for)/i,
];
const NEGATED_gavelhouse_WINNER_PATTERN =
  /\bGavelhouse\b[^.?!]*(?:not|never|isn't|is not|does not|doesn't)\s+(?:the\s+)?(?:best|winner|top|strongest|recommended|recommendation)/i;
const DIRECT_COLLECTION_HUBS: Partial<Record<PageFamily, string>> = {
  "lead-magnets": "/free/",
  "product-pages": "/product/",
  solutions: "/solutions/",
};

export const COLLECTION_RULES: Record<string, CollectionRule> = {
  alternatives: {
    family: "alternatives",
    classification: "commercial",
    route: (_slug, data) =>
      `/compare/alternatives/${String((data.competitor as { slug: string }).slug)}/`,
    expectedIntent: "commercial",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: true,
    requireReviewedAt: true,
  },
  comparisons: {
    family: "comparisons",
    classification: "commercial",
    route: (_slug, data) =>
      `/compare/versus/${String((data.competitorA as { slug: string }).slug)}-vs-${String((data.competitorB as { slug: string }).slug)}/`,
    expectedIntent: "commercial",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: true,
    requireReviewedAt: true,
  },
  "pricing-breakdowns": {
    family: "pricing-breakdowns",
    classification: "commercial",
    route: (slug) => `/compare/pricing/${slug}/`,
    expectedIntent: "transactional",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: true,
    requireReviewedAt: true,
  },
  listicles: {
    family: "listicles",
    classification: "commercial",
    route: (slug) => `/resources/best/${slug}/`,
    expectedIntent: "commercial",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: true,
    requireReviewedAt: true,
  },
  guides: {
    family: "guides",
    classification: "editorial",
    route: (slug) => `/resources/guides/${slug}/`,
    expectedIntent: "informational",
    requireAnswers: true,
    requireDefinitions: true,
    requireTable: false,
    requireReviewedAt: true,
  },
  "state-pages": {
    family: "state-pages",
    classification: "editorial",
    route: (slug) => `/hoa-compliance/${slug}/`,
    expectedIntent: "informational",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: true,
    requireReviewedAt: true,
  },
  "lead-magnets": {
    family: "lead-magnets",
    classification: "editorial",
    route: (slug) => `/free/${slug}/`,
    expectedIntent: "informational",
    requireAnswers: true,
    requireDefinitions: true,
    requireTable: false,
    requireReviewedAt: true,
  },
  "product-pages": {
    family: "product-pages",
    classification: "commercial",
    route: (slug) => `/product/${slug}/`,
    expectedIntent: "commercial",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: false,
    requireReviewedAt: false,
  },
  solutions: {
    family: "solutions",
    classification: "commercial",
    route: (slug) => `/solutions/${slug}/`,
    expectedIntent: "commercial",
    requireAnswers: true,
    requireDefinitions: false,
    requireTable: false,
    requireReviewedAt: false,
  },
};

export const STATIC_PAGES: AuditInventoryItem[] = [
  {
    path: "/",
    title: "Gavelhouse Home",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "index.astro"),
    noindex: false,
  },
  {
    path: "/about/",
    title: "About Gavelhouse",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "about.astro"),
    noindex: false,
  },
  {
    path: "/contact/",
    title: "Contact Gavelhouse",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "contact.astro"),
    noindex: false,
  },
  {
    path: "/features/",
    title: "Gavelhouse Features",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "features", "index.astro"),
    noindex: false,
  },
  {
    path: "/privacy/",
    title: "Privacy Policy",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "privacy.astro"),
    noindex: false,
  },
  {
    path: "/terms/",
    title: "Terms",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "terms.astro"),
    noindex: false,
  },
  {
    path: "/dpa/",
    title: "Data Processing Addendum",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "dpa.astro"),
    noindex: false,
  },
  {
    path: "/subprocessors/",
    title: "Subprocessors",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "subprocessors.astro"),
    noindex: false,
  },
  {
    path: "/unsubscribed/",
    title: "Unsubscribed",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "unsubscribed.astro"),
    noindex: true,
  },
  {
    path: "/resources/",
    title: "Resources",
    family: "static",
    classification: "editorial",
    sourceFile: path.join(PAGES_ROOT, "resources", "index.astro"),
    noindex: false,
  },
  {
    path: "/compare/",
    title: "Compare Gavelhouse",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "compare", "index.astro"),
    noindex: false,
  },
  {
    path: "/pricing/",
    title: "Gavelhouse Pricing",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "pricing.astro"),
    noindex: false,
  },
  {
    path: "/free/",
    title: "Free HOA Resources",
    family: "static",
    classification: "editorial",
    sourceFile: path.join(PAGES_ROOT, "free", "index.astro"),
    noindex: false,
  },
  {
    path: "/product/",
    title: "Gavelhouse Product",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "product", "[...page].astro"),
    noindex: false,
  },
  {
    path: "/solutions/",
    title: "Gavelhouse Solutions",
    family: "static",
    classification: "commercial",
    sourceFile: path.join(PAGES_ROOT, "solutions", "[...page].astro"),
    noindex: false,
  },
  {
    path: "/help/",
    title: "Gavelhouse Help",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "help", "index.astro"),
    noindex: false,
  },
  {
    path: "/llms.txt",
    title: "llms.txt",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "llms.txt.ts"),
    noindex: false,
  },
  {
    path: "/llms-full.txt",
    title: "llms-full.txt",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "llms-full.txt.ts"),
    noindex: false,
  },
  {
    path: "/pricing.txt",
    title: "pricing.txt",
    family: "static",
    classification: "utility",
    sourceFile: path.join(PAGES_ROOT, "pricing.txt.ts"),
    noindex: false,
  },
];

export const PAGINATED_HUB_RULES: PaginatedHubRule[] = [
  {
    collection: "alternatives",
    path: "/compare/alternatives",
    title: "Software Alternatives",
    sourceFile: path.join(
      PAGES_ROOT,
      "compare",
      "alternatives",
      "[...page].astro",
    ),
    classification: "commercial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
  {
    collection: "comparisons",
    path: "/compare/versus",
    title: "Head-to-Head Comparisons",
    sourceFile: path.join(PAGES_ROOT, "compare", "versus", "[...page].astro"),
    classification: "commercial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
  {
    collection: "pricing-breakdowns",
    path: "/compare/pricing",
    title: "Pricing Breakdowns",
    sourceFile: path.join(PAGES_ROOT, "compare", "pricing", "[...page].astro"),
    classification: "commercial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
  {
    collection: "guides",
    path: "/resources/guides",
    title: "HOA Compliance Guides",
    sourceFile: path.join(PAGES_ROOT, "resources", "guides", "[...page].astro"),
    classification: "editorial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
  {
    collection: "listicles",
    path: "/resources/best",
    title: "Software Roundups",
    sourceFile: path.join(PAGES_ROOT, "resources", "best", "[...page].astro"),
    classification: "editorial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
  {
    collection: "state-pages",
    path: "/hoa-compliance",
    title: "HOA Compliance by State",
    sourceFile: path.join(PAGES_ROOT, "hoa-compliance", "[...page].astro"),
    classification: "editorial",
    pageSize: DEFAULT_PAGE_SIZE,
  },
];

interface MarkdownPage {
  data: Record<string, unknown>;
  content: string;
}

function readMarkdownPage(filePath: string): MarkdownPage {
  const parsed = matter.read(filePath);
  return {
    data: parsed.data as Record<string, unknown>,
    content: parsed.content,
  };
}

function readMarkdownData(filePath: string): Record<string, unknown> {
  return readMarkdownPage(filePath).data;
}

function stringifyFrontmatterValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(stringifyFrontmatterValue).join("");
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).map(stringifyFrontmatterValue).join("");
  }
  return "";
}

function isGavelhouseComparison(
  data: Record<string, unknown>,
  content = "",
): boolean {
  const competitorA = data.competitorA as { slug?: unknown; name?: unknown };
  const competitorB = data.competitorB as { slug?: unknown; name?: unknown };
  const namedAsCompetitor = [competitorA, competitorB].some(
    (competitor) =>
      competitor?.slug === "gavelhouse" || competitor?.name === "Gavelhouse",
  );
  if (namedAsCompetitor) return true;

  const comparisonText = [
    data.bluf,
    data.verdict,
    data.answers,
    data.faqs,
    data.tableData,
    data.proscons,
    content,
  ]
    .map(stringifyFrontmatterValue)
    .join("");
  return /\bGavelhouse\b/i.test(comparisonText);
}

function hasGavelhouseWinnerPositioning(
  data: Record<string, unknown>,
  content = "",
): boolean {
  const text = [data.bluf, data.verdict, data.answers, data.faqs, content]
    .map(stringifyFrontmatterValue)
    .join("");
  if (NEGATED_gavelhouse_WINNER_PATTERN.test(text)) return false;
  return gavelhouse_WINNER_PATTERNS.some((pattern) => pattern.test(text));
}

function getMarkdownFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry));
}

function normalizeDate(date?: string): number | undefined {
  if (!date) return undefined;
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? undefined : time;
}

function isIsoDate(date?: string): boolean {
  if (!date || !ISO_DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
  );
}

function stripTerminalPunctuation(value: string): string {
  return value
    .trim()
    .replace(/[.!?:;,)]$/, "")
    .trim();
}

function hasLikelyTruncatedMetadata(
  field: "title" | "description",
  value: string,
): boolean {
  const normalized = stripTerminalPunctuation(value);
  const pattern =
    field === "title"
      ? TRUNCATED_TITLE_END_PATTERN
      : TRUNCATED_DESCRIPTION_END_PATTERN;
  return pattern.test(normalized);
}

function getAnswerFields(
  answer: unknown,
): { question: string; answer: string } | undefined {
  if (typeof answer === "string") {
    return { question: "answer", answer };
  }
  if (typeof answer !== "object" || answer === null) {
    return undefined;
  }
  const item = answer as {
    q?: unknown;
    question?: unknown;
    a?: unknown;
    answer?: unknown;
  };
  const question = item.q ?? item.question;
  const answerText = item.a ?? item.answer;
  if (typeof answerText !== "string") return undefined;
  return {
    question:
      typeof question === "string" && question.trim() ? question : "answer",
    answer: answerText,
  };
}

export interface PublicPageAuditOptions {
  contentRoot?: string;
  staticPages?: AuditInventoryItem[];
  now?: number;
  publicRoot?: string;
  skipOgImageCheck?: boolean;
  skipNoindexSyncCheck?: boolean;
}

function normalizeRelatedPagePath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withTrailingSlash = withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
  return withTrailingSlash;
}

function isInternalHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.hostname === BRAND_DOMAIN || url.hostname === `www.${BRAND_DOMAIN}`
    );
  } catch {
    return false;
  }
}

function normalizeInternalPath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (/^(mailto:|tel:|javascript:|#)/i.test(trimmed)) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    if (!isInternalHttpUrl(trimmed)) return undefined;
    const url = new URL(trimmed);
    return normalizeRelatedPagePath(url.pathname);
  }
  if (!trimmed.startsWith("/")) return undefined;
  return normalizeRelatedPagePath(trimmed);
}

function hasFileExtension(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function addInboundEdge(
  inbound: Map<string, Set<string>>,
  from: string,
  to: string | undefined,
): void {
  if (!to || from === to) return;
  const sources = inbound.get(to) ?? new Set<string>();
  sources.add(from);
  inbound.set(to, sources);
}

function collectChromeLinks(): string[] {
  return [
    ...NAV_ITEMS.flatMap((item) => [
      item.href,
      ...(item.megaMenu ?? []).flatMap((section) =>
        section.links.map((link) => link.href),
      ),
    ]),
    ...FOOTER_LINK_GROUPS.flatMap((group) =>
      group.links.map((link) => link.href),
    ),
    ...FOOTER_LEGAL_LINKS.map((link) => link.href),
    "/",
    "/contact/",
  ];
}

function buildInboundInternalLinkMap(
  inventory: AuditInventoryItem[],
): Map<string, Set<string>> {
  const inbound = new Map<string, Set<string>>();
  const routeSet = new Set(inventory.map((item) => item.path));
  const chromeLinks = collectChromeLinks()
    .map(normalizeInternalPath)
    .filter((href): href is string => href !== undefined)
    .filter((href) => routeSet.has(href));

  for (const item of inventory) {
    if (!item.noindex) {
      for (const href of chromeLinks) {
        addInboundEdge(inbound, item.path, href);
      }
    }
  }

  const collectionItems = inventory.filter(
    (item) =>
      item.family !== "static" &&
      item.family !== "hub" &&
      item.family !== "help",
  );
  for (const item of collectionItems) {
    const matchingHub = PAGINATED_HUB_RULES.find(
      (rule) => rule.collection === item.family,
    );
    const hubPath = matchingHub
      ? normalizeRelatedPagePath(`${matchingHub.path}/`)
      : DIRECT_COLLECTION_HUBS[item.family];
    if (hubPath && routeSet.has(hubPath)) {
      addInboundEdge(inbound, hubPath, item.path);
      addInboundEdge(inbound, item.path, hubPath);
    }
  }

  for (const hubRule of PAGINATED_HUB_RULES) {
    const hubPages = inventory
      .filter(
        (item) =>
          item.family === "hub" && item.path.startsWith(`${hubRule.path}/`),
      )
      .map((item) => item.path)
      .sort();
    for (let index = 0; index < hubPages.length; index += 1) {
      addInboundEdge(inbound, hubPages[index - 1] ?? "/", hubPages[index]);
      addInboundEdge(inbound, hubPages[index + 1] ?? "/", hubPages[index]);
    }
  }

  for (const item of collectionItems) {
    const data = readMarkdownData(item.sourceFile);
    const relatedPages = Array.isArray(data.relatedPages)
      ? data.relatedPages
      : [];
    for (const ref of relatedPages) {
      if (typeof ref !== "string") continue;
      const normalized = normalizeInternalPath(ref);
      addInboundEdge(inbound, item.path, normalized);
    }
  }

  for (const item of inventory) {
    if (item.noindex) continue;
    for (const hub of getResourceHubsForPath(item.path)) {
      const hubPath = getResourceHubHref(hub.slug);
      if (!routeSet.has(hubPath)) continue;
      addInboundEdge(inbound, hubPath, item.path);
    }
  }

  return inbound;
}

export function buildPublicPageInventory(
  options: PublicPageAuditOptions = {},
): AuditInventoryItem[] {
  const contentRoot = options.contentRoot ?? CONTENT_ROOT;
  const inventory = [...(options.staticPages ?? STATIC_PAGES)];

  if (options.staticPages === undefined) {
    for (const hub of RESOURCE_HUBS) {
      inventory.push({
        path: getResourceHubHref(hub.slug),
        title: hub.title,
        family: "hub",
        classification: "editorial",
        sourceFile: path.join(PAGES_ROOT, "resources", "hubs", "[slug].astro"),
        noindex: false,
      });
    }

    for (const topic of PRODUCT_HELP_TOPICS) {
      inventory.push({
        path: `/help/${topic.slug}/`,
        title: topic.title,
        family: "help",
        classification: "utility",
        sourceFile: path.join(PAGES_ROOT, "help", "[slug].astro"),
        noindex: false,
      });
    }
  }

  for (const hubRule of PAGINATED_HUB_RULES) {
    const fileCount = getMarkdownFiles(
      path.join(contentRoot, hubRule.collection),
    ).length;
    const pageCount = Math.max(1, Math.ceil(fileCount / hubRule.pageSize));

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageSuffix = pageNumber === 1 ? "/" : `/${pageNumber}/`;
      const pageLabel = pageNumber === 1 ? "" : ` Page ${pageNumber}`;

      inventory.push({
        path: `${hubRule.path}${pageSuffix}`,
        title: `${hubRule.title}${pageLabel}`,
        family: "hub",
        classification: hubRule.classification,
        sourceFile: hubRule.sourceFile,
        noindex: false,
      });
    }
  }

  for (const [collectionName, rule] of Object.entries(COLLECTION_RULES)) {
    const dirPath = path.join(contentRoot, collectionName);
    for (const filePath of getMarkdownFiles(dirPath)) {
      const data = readMarkdownData(filePath);
      if (data.draft === true) continue;
      const slug = path.basename(filePath, ".md");
      inventory.push({
        path: rule.route(slug, data),
        title: String(data.title ?? slug),
        family: rule.family,
        classification: rule.classification,
        sourceFile: filePath,
        noindex: Boolean(data.noindex),
        primaryKeyword:
          typeof data.primaryKeyword === "string"
            ? data.primaryKeyword
            : undefined,
        searchIntent:
          typeof data.searchIntent === "string" ? data.searchIntent : undefined,
        reviewedAt:
          typeof data.reviewedAt === "string" ? data.reviewedAt : undefined,
        updatedAt:
          typeof data.updatedAt === "string" ? data.updatedAt : undefined,
        relatedPagesCount: Array.isArray(data.relatedPages)
          ? data.relatedPages.length
          : 0,
        sourcesCount: Array.isArray(data.sources) ? data.sources.length : 0,
      });
    }
  }

  return inventory.sort((a, b) => a.path.localeCompare(b.path));
}

export function auditPublicPages(
  options: PublicPageAuditOptions = {},
): PublicPageAuditReport {
  const inventory = buildPublicPageInventory(options);
  const errors: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const now = options.now ?? Date.now();
  const staleWindowMs = 1000 * 60 * 60 * 24 * 180;
  const publicRoot = options.publicRoot ?? PUBLIC_ROOT;
  const contentRoot = options.contentRoot ?? CONTENT_ROOT;

  const primaryKeywordIndex = new Map<
    string,
    { path: string; sourceFile: string }[]
  >();
  const routeSet = new Set(inventory.map((item) => item.path));
  const pathIndex = new Map<string, AuditInventoryItem[]>();
  const inboundInternalLinks = buildInboundInternalLinkMap(inventory);

  for (const item of inventory) {
    if (item.noindex) continue;
    const siblings = pathIndex.get(item.path) ?? [];
    siblings.push(item);
    pathIndex.set(item.path, siblings);
  }

  for (const [publicPath, pages] of pathIndex.entries()) {
    if (pages.length < 2) continue;
    for (const page of pages) {
      const siblings = pages
        .filter((p) => p.sourceFile !== page.sourceFile)
        .map((p) => toRepoRelativePosix(p.sourceFile))
        .join(", ");
      errors.push({
        severity: "error",
        path: publicPath,
        sourceFile: page.sourceFile,
        message: `Indexable path is duplicated by: ${siblings}.`,
      });
    }
  }

  for (const item of inventory) {
    if (
      item.family === "static" ||
      item.family === "hub" ||
      item.family === "help"
    ) {
      continue;
    }

    const rule = COLLECTION_RULES[path.basename(path.dirname(item.sourceFile))];
    const page = readMarkdownPage(item.sourceFile);
    const data = page.data;
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const definitions = Array.isArray(data.definitions) ? data.definitions : [];
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const relatedPages = Array.isArray(data.relatedPages)
      ? data.relatedPages
      : [];
    const faqs = Array.isArray(data.faqs) ? data.faqs : [];
    const hasTable = Boolean(data.tableData);
    const updatedAt =
      typeof data.updatedAt === "string" ? data.updatedAt : undefined;
    const reviewedAt =
      typeof data.reviewedAt === "string" ? data.reviewedAt : undefined;

    const pushError = (message: string) =>
      errors.push({
        severity: "error",
        path: item.path,
        sourceFile: item.sourceFile,
        message,
      });
    const pushWarning = (message: string) =>
      warnings.push({
        severity: "warning",
        path: item.path,
        sourceFile: item.sourceFile,
        message,
      });

    if (!data.title || !data.description) {
      pushError("Missing required title or description.");
    }
    if (
      typeof data.title === "string" &&
      LITERAL_TRUNCATED_TITLE_PATTERN.test(data.title.trim())
    ) {
      pushError("Frontmatter title appears literally truncated with `...`.");
    }
    if (
      typeof data.description === "string" &&
      LITERAL_TRUNCATED_DESCRIPTION_PATTERN.test(data.description.trim())
    ) {
      pushError(
        "Frontmatter description appears literally truncated with `...`.",
      );
    }
    if (
      typeof data.title === "string" &&
      hasLikelyTruncatedMetadata("title", data.title)
    ) {
      pushError("Frontmatter title appears to end mid-phrase.");
    }
    if (
      typeof data.description === "string" &&
      hasLikelyTruncatedMetadata("description", data.description)
    ) {
      pushError("Frontmatter description appears to end mid-phrase.");
    }
    if (!data.bluf) {
      pushError(
        "Missing direct-answer `bluf` summary near the top of the page.",
      );
    }
    if (
      typeof data.primaryKeyword !== "string" ||
      data.primaryKeyword.trim() === ""
    ) {
      pushError("Missing required `primaryKeyword`.");
    }
    if (typeof data.searchIntent !== "string") {
      pushError("Missing required `searchIntent`.");
    } else if (data.searchIntent !== rule.expectedIntent) {
      pushWarning(
        `Search intent is \`${data.searchIntent}\` but the route family expects \`${rule.expectedIntent}\`.`,
      );
    }
    if (sources.length === 0) {
      pushError("Missing required `sources` citations list.");
    }
    if (relatedPages.length === 0) {
      pushError("Missing related pages for internal linking.");
    }
    for (const ref of relatedPages) {
      if (typeof ref !== "string") continue;
      const normalized = normalizeInternalPath(ref);
      if (!normalized) {
        pushError(`Internal related page \`${ref}\` must be an absolute path.`);
        continue;
      }
      if (!routeSet.has(normalized)) {
        pushError(
          `Internal related page \`${ref}\` does not resolve to a known public route.`,
        );
      }
    }
    if (rule.requireAnswers && answers.length === 0) {
      pushError("Missing answer blocks for AI-extractable summaries.");
    }
    for (const answer of answers) {
      const fields = getAnswerFields(answer);
      if (!fields) continue;
      const length = validateAnswerLength(fields.answer);
      if (!length.valid) {
        pushWarning(
          `Answer block \`${fields.question}\` is ${length.wordCount} words; expected 40-60 words for AI extractability.`,
        );
      }
    }
    if (rule.requireDefinitions && definitions.length === 0) {
      pushError("Missing definition blocks required for this page family.");
    }
    if (rule.requireTable && !hasTable) {
      pushError(
        "Missing structured comparison/data table required for this page family.",
      );
    }
    if (
      rule.family === "comparisons" &&
      isGavelhouseComparison(data, page.content) &&
      !hasGavelhouseWinnerPositioning(data, page.content)
    ) {
      pushError(gavelhouse_WINNER_MESSAGE);
    }
    if (rule.requireReviewedAt && !reviewedAt) {
      pushError("Missing `reviewedAt` for a fact-heavy page.");
    }
    if (updatedAt !== undefined && !isIsoDate(updatedAt)) {
      pushError("`updatedAt` must be an ISO yyyy-mm-dd date.");
    }
    if (reviewedAt !== undefined && !isIsoDate(reviewedAt)) {
      pushError("`reviewedAt` must be an ISO yyyy-mm-dd date.");
    }
    if (faqs.length === 0) {
      pushWarning("No FAQ entries present.");
    }
    if (sources.length > 0) {
      for (const source of sources) {
        if (
          typeof source !== "object" ||
          source === null ||
          typeof (source as { title?: unknown }).title !== "string" ||
          typeof (source as { source?: unknown }).source !== "string" ||
          typeof (source as { url?: unknown }).url !== "string" ||
          typeof (source as { lastChecked?: unknown }).lastChecked !== "string"
        ) {
          pushError(
            "Source entries must include title, source, url, and lastChecked.",
          );
          break;
        }
        if (
          !isIsoDate(String((source as { lastChecked: string }).lastChecked))
        ) {
          pushError(
            "Source `lastChecked` values must be ISO yyyy-mm-dd dates.",
          );
          break;
        }
        const sourceDate = normalizeDate(
          String((source as { lastChecked: string }).lastChecked),
        );
        if (sourceDate !== undefined && now - sourceDate > staleWindowMs) {
          pushWarning(
            `Source \`${String((source as { title: string }).title)}\` was last checked more than 180 days ago.`,
          );
        }
      }
    }

    const freshnessDate = normalizeDate(reviewedAt ?? updatedAt);
    if (freshnessDate !== undefined && now - freshnessDate > staleWindowMs) {
      pushWarning("Content review date is older than 180 days.");
    }

    if (
      typeof data.title === "string" &&
      data.title.length > META_TITLE_MAX_LEN
    ) {
      pushWarning(
        `Meta title is ${data.title.length} chars; will be truncated to ${META_TITLE_MAX_LEN}.`,
      );
    }
    if (
      typeof data.description === "string" &&
      data.description.length > META_DESCRIPTION_MAX_LEN
    ) {
      pushWarning(
        `Meta description is ${data.description.length} chars; will be truncated to ${META_DESCRIPTION_MAX_LEN}.`,
      );
    }

    if (!options.skipOgImageCheck && typeof data.ogImage === "string") {
      const ogImageRel = data.ogImage.trim();
      if (ogImageRel.startsWith("/") && !ogImageRel.startsWith("//")) {
        const onDisk = path.join(publicRoot, ogImageRel.replace(/^\//, ""));
        if (!fs.existsSync(onDisk)) {
          pushError(
            `Frontmatter ogImage \`${ogImageRel}\` does not exist at public${ogImageRel}.`,
          );
        }
      }
    }

    if (
      !item.noindex &&
      typeof data.primaryKeyword === "string" &&
      data.primaryKeyword.trim() !== ""
    ) {
      const key = data.primaryKeyword.trim().toLowerCase();
      const existing = primaryKeywordIndex.get(key) ?? [];
      existing.push({ path: item.path, sourceFile: item.sourceFile });
      primaryKeywordIndex.set(key, existing);
    }
  }

  for (const item of inventory) {
    if (item.noindex || hasFileExtension(item.path)) continue;
    const inboundCount = inboundInternalLinks.get(item.path)?.size ?? 0;
    const resourceHubCount = getResourceHubsForPath(item.path).length;
    if (inboundCount === 0) {
      errors.push({
        severity: "error",
        path: item.path,
        sourceFile: item.sourceFile,
        message: "No inbound internal links point to this indexable page.",
      });
    }
    if (item.family !== "hub" && resourceHubCount === 0) {
      errors.push({
        severity: "error",
        path: item.path,
        sourceFile: item.sourceFile,
        message: "Indexable page is not assigned to a resource hub.",
      });
    }
  }

  for (const [keyword, pages] of primaryKeywordIndex.entries()) {
    if (pages.length < 2) continue;
    for (const { path: pagePath, sourceFile } of pages) {
      const siblings = pages
        .map((p) => p.path)
        .filter((p) => p !== pagePath)
        .join(",");
      errors.push({
        severity: "error",
        path: pagePath,
        sourceFile,
        message: `primaryKeyword \`${keyword}\` collides with: ${siblings}.`,
      });
    }
  }

  if (!options.skipNoindexSyncCheck) {
    const noindexPaths = getNoindexPaths(contentRoot);
    const normalizedNoindexPaths = new Set(
      [...noindexPaths].map((noindexPath) => noindexPath.replace(/\/$/, "")),
    );
    for (const item of inventory) {
      if (item.family === "hub") continue;
      if (!item.noindex) continue;
      if (!normalizedNoindexPaths.has(item.path.replace(/\/$/, ""))) {
        errors.push({
          severity: "error",
          path: item.path,
          sourceFile: item.sourceFile,
          message:
            "Frontmatter sets `noindex: true` but getNoindexPaths() does not include this path -- sitemap filter will still emit it.",
        });
      }
    }
  }

  for (const staticPage of inventory.filter(
    (item) => item.family === "static" || item.family === "hub",
  )) {
    if (!fs.existsSync(staticPage.sourceFile)) {
      errors.push({
        severity: "error",
        path: staticPage.path,
        sourceFile: staticPage.sourceFile,
        message: "Static page route file is missing.",
      });
    }
  }

  const summary = {
    totalPages: inventory.length,
    indexablePages: inventory.filter((item) => !item.noindex).length,
    commercialPages: inventory.filter(
      (item) => item.classification === "commercial",
    ).length,
    editorialPages: inventory.filter(
      (item) => item.classification === "editorial",
    ).length,
    utilityPages: inventory.filter((item) => item.classification === "utility")
      .length,
  };

  return {
    inventory: inventory.map((item) => ({
      ...item,
      inboundInternalLinkCount: inboundInternalLinks.get(item.path)?.size ?? 0,
      resourceHubCount: getResourceHubsForPath(item.path).length,
      sourceFile: toRepoRelativePosix(item.sourceFile),
    })),
    errors: errors.map((issue) => ({
      ...issue,
      sourceFile: toRepoRelativePosix(issue.sourceFile),
    })),
    warnings: warnings.map((issue) => ({
      ...issue,
      sourceFile: toRepoRelativePosix(issue.sourceFile),
    })),
    summary,
  };
}
