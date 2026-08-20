import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { PRODUCT_PRICE, PUBLIC_WEB_URL } from "@boardstack/shared";

const CONTENT_ROOT = path.resolve(process.cwd(), "src/content");
const TODAY = new Date().toISOString().slice(0, 10);
const MIN_ANSWER_WORDS = 40;
const TARGET_ANSWER_WORDS = 52;
const MAX_ANSWER_WORDS = 60;
const MAX_TITLE_CHARS = 60;
const MAX_DESCRIPTION_CHARS = 160;
const ANSWER_EXTENSION =
  "Boards should verify the details against their governing documents, current vendor terms, and applicable state requirements before making the decision and keeping the rationale in the board record.";
const WEAK_ANSWER_ENDING_PATTERN =
  /\b(?:and|or|to|for|with|without|by|of|in|as|how|showing|and fiduciary)\.$/i;

type Frontmatter = Record<string, unknown>;

const searchIntentByCollection: Record<string, string> = {
  alternatives: "commercial",
  comparisons: "commercial",
  "pricing-breakdowns": "transactional",
  listicles: "commercial",
  guides: "informational",
  "state-pages": "informational",
  "lead-magnets": "informational",
  "product-pages": "commercial",
  solutions: "commercial",
};

const fallbackSourceByCollection: Record<
  string,
  { title: string; source: string; url: string }
> = {
  alternatives: {
    title: "Gavelhouse comparison methodology",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/compare/`,
  },
  comparisons: {
    title: "Gavelhouse comparison methodology",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/compare/`,
  },
  "pricing-breakdowns": {
    title: "Gavelhouse pricing overview",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/pricing.txt`,
  },
  listicles: {
    title: "Gavelhouse software evaluation framework",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/resources/`,
  },
  guides: {
    title: "Foundation for Community Association Research",
    source: "Community Associations Institute",
    url: "https://www.caionline.org/research",
  },
  "state-pages": {
    title: "Foundation for Community Association Research",
    source: "Community Associations Institute",
    url: "https://www.caionline.org/research",
  },
  "lead-magnets": {
    title: "Gavelhouse resource library",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/resources/`,
  },
  "product-pages": {
    title: "Gavelhouse product overview",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/`,
  },
  solutions: {
    title: "Gavelhouse product overview",
    source: "Gavelhouse",
    url: `${PUBLIC_WEB_URL}/`,
  },
};

function listMarkdownFiles(dirPath: string): string[] {
  return fs
    .readdirSync(dirPath)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry));
}

function toKeyword(input: string): string {
  return input
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function uniqueSources(
  sources: Array<{ title: string; source: string; url: string }>,
) {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.title}|${item.source}|${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scrubUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubUndefined(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, scrubUndefined(entry)]],
      ),
    ) as T;
  }

  return value;
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function wordCount(value: string): number {
  return words(value).length;
}

function sentenceParts(value: string): string[] {
  return value
    .replace(/\s+/g, "")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function trimToWordLimit(value: string, maxWords: number): string {
  const trimmedWords = words(value).slice(0, maxWords);
  const joined = trimmedWords
    .join("")
    .replace(/\s+(?:and|or|to|for|with|without|by|of|in|as|how)$/i, "")
    .replace(/\s+(?:and|or)\s+\w+$/i, "")
    .replace(/[,:;–-]\s*$/, "");
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

function shortenAnswer(value: string): string {
  const sentences = sentenceParts(value);
  let candidate = "";

  for (const sentence of sentences) {
    const next = `${candidate}${candidate ? "" : ""}${sentence}`.trim();
    if (wordCount(next) > MAX_ANSWER_WORDS) break;
    candidate = next;
    if (wordCount(candidate) >= MIN_ANSWER_WORDS) return candidate;
  }

  if (candidate) {
    return expandAnswer(candidate, {});
  }

  return trimToWordLimit(value, MAX_ANSWER_WORDS);
}

function expandAnswer(value: string, data: Frontmatter): string {
  let candidate = value.replace(/\s+/g, "").trim();
  const context = [data.bluf, data.description, data.verdict]
    .filter((entry): entry is string => typeof entry === "string")
    .join("");
  for (const source of [context, ANSWER_EXTENSION]) {
    if (wordCount(candidate) >= MIN_ANSWER_WORDS) break;
    const sourceWords = words(source);
    for (const word of sourceWords) {
      if (wordCount(candidate) >= TARGET_ANSWER_WORDS) break;
      candidate = `${candidate} ${word}`.trim();
    }
  }
  if (wordCount(candidate) < MIN_ANSWER_WORDS) {
    candidate = `${candidate} ${ANSWER_EXTENSION}`.trim();
  }
  return trimToWordLimit(candidate, MAX_ANSWER_WORDS);
}

function normalizeAnswerText(value: string, data: Frontmatter): string {
  const normalized = value.replace(/\s+/g, "").trim();
  if (WEAK_ANSWER_ENDING_PATTERN.test(normalized)) {
    return expandAnswer(
      normalized
        .replace(WEAK_ANSWER_ENDING_PATTERN, "")
        .replace(/[,:;–-]\s*$/, "")
        .trim(),
      data,
    );
  }
  const count = wordCount(normalized);
  if (count > MAX_ANSWER_WORDS) return shortenAnswer(normalized);
  if (count < MIN_ANSWER_WORDS) return expandAnswer(normalized, data);
  return normalized;
}

function normalizeAnswers(answers: unknown, data: Frontmatter): unknown {
  if (!Array.isArray(answers)) return answers;
  return answers.map((answer) => {
    if (typeof answer === "string") {
      return normalizeAnswerText(answer, data);
    }
    if (!answer || typeof answer !== "object") {
      return answer;
    }
    const item = { ...(answer as Record<string, unknown>) };
    if (typeof item["a"] === "string") {
      item["a"] = normalizeAnswerText(item["a"], data);
    }
    if (typeof item["answer"] === "string") {
      item["answer"] = normalizeAnswerText(item["answer"], data);
    }
    return item;
  });
}

function normalizeTitle(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let title = value.replace(/\.\.\.$/, "").trim();
  title = title
    .replace(/:\s*What Volunteer(?: Boards Need)?$/i, "")
    .replace(/:\s*What Boards and Sellers Must(?: Know)?$/i, "")
    .replace(/:\s*Bids, Insurance & Legal$/i, "")
    .replace(/:\s*Due Process, Fines &$/i, "")
    .replace(/:\s*A Treasurer''s$/i, "")
    .replace(/What Volunteer$/i, "What Volunteer Boards Need")
    .replace(
      /What Boards and Sellers Must$/i,
      "What Boards and Sellers Must Know",
    )
    .replace(/Bids, Insurance & Legal$/i, "Bids, Insurance & Terms")
    .replace(/Due Process, Fines &$/i, "Due Process and Fines")
    .replace(/A Treasurer''s$/i, "Treasurer Guide")
    .replace(/\ba$/i, "Guide");
  if (title.length <= MAX_TITLE_CHARS) return title;
  return title
    .replace(/\s+\([^)]*\)/g, "")
    .replace(/\s+-\s+.*$/, "")
    .slice(0, MAX_TITLE_CHARS)
    .replace(/\s+\S*$/, "")
    .trim();
}

function normalizeDescription(value: unknown): unknown {
  if (typeof value !== "string" || value.length <= MAX_DESCRIPTION_CHARS) {
    return value;
  }
  const description = value
    .slice(0, MAX_DESCRIPTION_CHARS)
    .replace(/\s+\S*$/, "")
    .replace(/[,:;–-]\s*$/, "")
    .trim();
  return /[.!?]$/.test(description) ? description : `${description}.`;
}

function deriveSources(collection: string, data: Frontmatter, slug: string) {
  const gathered: Array<{
    title: string;
    source: string;
    url: string;
    lastChecked: string;
  }> = [];

  for (const existing of Array.isArray(data.sources) ? data.sources : []) {
    if (existing?.title && existing?.source && existing?.url) {
      gathered.push({
        title: String(existing.title),
        source: String(existing.source),
        url: String(existing.url),
        lastChecked: String(
          existing.lastChecked ?? data.reviewedAt ?? data.updatedAt ?? TODAY,
        ),
      });
    }
  }

  for (const blockName of ["statistics", "pricingStats"]) {
    for (const item of Array.isArray(data[blockName]) ? data[blockName] : []) {
      if (item?.source && item?.sourceUrl) {
        gathered.push({
          title: String(item.source),
          source: String(item.source),
          url: String(item.sourceUrl),
          lastChecked: String(data.reviewedAt ?? data.updatedAt ?? TODAY),
        });
      }
    }
  }

  if (data.competitor?.url) {
    gathered.push({
      title: `${String(data.competitor.name)} official website`,
      source: String(data.competitor.name),
      url: String(data.competitor.url),
      lastChecked: String(data.reviewedAt ?? data.updatedAt ?? TODAY),
    });
  }

  const fallback = fallbackSourceByCollection[collection];
  if (gathered.length === 0 && fallback) {
    gathered.push({
      ...fallback,
      lastChecked: String(data.reviewedAt ?? data.updatedAt ?? TODAY),
    });
  }

  if (collection === "product-pages" || collection === "solutions") {
    gathered.push({
      title: "Gavelhouse pricing",
      source: "Gavelhouse",
      url: `${PUBLIC_WEB_URL}/pricing.txt`,
      lastChecked: String(data.reviewedAt ?? data.updatedAt ?? TODAY),
    });
  }

  if (collection === "lead-magnets") {
    gathered.push({
      title: data.title,
      source: "Gavelhouse",
      url: `${PUBLIC_WEB_URL}/free/${slug}/`,
      lastChecked: String(data.reviewedAt ?? data.updatedAt ?? TODAY),
    });
  }

  return uniqueSources(gathered).map((item) => ({
    ...item,
    lastChecked: item.lastChecked,
  }));
}

function ensureAnswers(collection: string, data: Frontmatter, _slug: string) {
  if (Array.isArray(data.answers) && data.answers.length > 0) {
    return data.answers;
  }

  const question = (() => {
    if (collection === "solutions") {
      return `Who is ${data.title} for?`;
    }
    if (collection === "lead-magnets") {
      return `What do you get in ${data.title}?`;
    }
    if (collection === "product-pages") {
      return `What does ${data.title} help a board do?`;
    }
    return `What should a board know about ${data.title}?`;
  })();

  const answer = (() => {
    if (typeof data.bluf === "string" && data.bluf.trim().length > 0) {
      return data.bluf;
    }
    return typeof data.description === "string"
      ? data.description
      : `${data.title} gives volunteer boards a more direct way to evaluate this workflow.`;
  })();

  return [{ q: question, a: answer }];
}

function ensureDefinitions(collection: string, data: Frontmatter) {
  if (Array.isArray(data.definitions) && data.definitions.length > 0) {
    return data.definitions;
  }

  if (!["lead-magnets", "guides"].includes(collection)) {
    return data.definitions;
  }

  return [
    {
      term: data.title,
      definition:
        typeof data.description === "string" ? data.description : data.bluf,
    },
  ];
}

function ensureFaqs(collection: string, data: Frontmatter) {
  if (Array.isArray(data.faqs) && data.faqs.length > 0) {
    return data.faqs;
  }

  if (collection !== "lead-magnets") {
    return data.faqs;
  }

  return [
    {
      q: `Who should use ${data.title}?`,
      a:
        typeof data.bluf === "string" && data.bluf.trim().length > 0
          ? data.bluf
          : String(
              data.description ??
                "Volunteer HOA and condo boards using this resource.",
            ),
    },
  ];
}

function ensureTable(collection: string, data: Frontmatter) {
  if (data.tableData) {
    return data.tableData;
  }

  if (collection === "alternatives") {
    return {
      name: `${data.competitor.name} vs Gavelhouse`,
      description:
        "A quick board-level comparison for self-managed communities.",
      columns: ["Decision factor", String(data.competitor.name), "Gavelhouse"],
      rows: [
        [
          "Pricing model",
          String(data.competitor.pricing),
          `${PRODUCT_PRICE} flat by community size`,
        ],
        [
          "Reserve workflow",
          String(data.competitor.weakness),
          "Reserve tracking and fund separation stay in one workflow",
        ],
        [
          "Best fit",
          "Boards focused mainly on payments and owner self-service",
          "Boards that need financial control, reserve visibility, and audit-ready records",
        ],
      ],
    };
  }

  if (collection === "pricing-breakdowns") {
    return {
      name: `${data.competitor.name} pricing summary`,
      description:
        "Entry price, plan structure, and cost posture compared with Gavelhouse.",
      columns: ["Pricing factor", String(data.competitor.name), "Gavelhouse"],
      rows: [
        ["Entry price", String(data.competitor.pricing), PRODUCT_PRICE],
        [
          "Plan structure",
          `${Array.isArray(data.tiers) ? data.tiers.length : 0} visible tiers`,
          "Flat plans by community size",
        ],
        [
          "Watch item",
          Array.isArray(data.hiddenCosts) && data.hiddenCosts[0]
            ? String(data.hiddenCosts[0])
            : "Review contract details for add-ons",
          "No setup fee and a simpler plan ladder",
        ],
      ],
    };
  }

  if (collection === "product-pages") {
    return {
      name: `${data.title} evaluation summary`,
      description:
        "How this Gavelhouse workflow is structured for volunteer boards.",
      columns: ["Evaluation area", "Gavelhouse approach"],
      rows: [
        ["Primary use case", String(data.productCategory ?? data.title)],
        [
          "Best-fit roles",
          Array.isArray(data.targetRoles)
            ? data.targetRoles.join(",")
            : "Volunteer boards",
        ],
        [
          "Key workflow",
          Array.isArray(data.keyFeatures) && data.keyFeatures[0]
            ? String(data.keyFeatures[0])
            : String(data.bluf),
        ],
      ],
    };
  }

  if (collection === "solutions") {
    return {
      name: `${data.title} workflow fit`,
      description:
        "What this audience is solving for and how Gavelhouse responds.",
      columns: [
        "Workflow area",
        String(data.audienceLabel ?? data.title),
        "Gavelhouse",
      ],
      rows: [
        [
          "Main constraint",
          Array.isArray(data.painPoints) && data.painPoints[0]
            ? String(data.painPoints[0])
            : String(data.bluf),
          Array.isArray(data.outcomes) && data.outcomes[0]
            ? String(data.outcomes[0])
            : String(data.description),
        ],
        [
          "Operations goal",
          Array.isArray(data.painPoints) && data.painPoints[1]
            ? String(data.painPoints[1])
            : "Reduce volunteer admin drift",
          Array.isArray(data.outcomes) && data.outcomes[1]
            ? String(data.outcomes[1])
            : "Create a cleaner month-to-month board workflow",
        ],
        [
          "Buying lens",
          Array.isArray(data.painPoints) && data.painPoints[2]
            ? String(data.painPoints[2])
            : "Avoid overbuilt manager-first software",
          Array.isArray(data.outcomes) && data.outcomes[2]
            ? String(data.outcomes[2])
            : "Keep pricing and controls aligned with a volunteer board",
        ],
      ],
    };
  }

  return data.tableData;
}

function derivePrimaryKeyword(
  collection: string,
  data: Frontmatter,
  slug: string,
) {
  if (
    typeof data.primaryKeyword === "string" &&
    data.primaryKeyword.trim() !== ""
  ) {
    return data.primaryKeyword;
  }

  if (collection === "comparisons") {
    return `${data.competitorA.name} vs ${data.competitorB.name}`.toLowerCase();
  }
  if (collection === "pricing-breakdowns") {
    return `${data.competitor.name} pricing`.toLowerCase();
  }
  if (collection === "state-pages") {
    return `hoa reserve fund compliance in ${String(data.state).toLowerCase()}`;
  }

  return toKeyword(typeof data.title === "string" ? data.title : slug);
}

function normalizeFile(filePath: string, collection: string) {
  const file = matter.read(filePath);
  const data = file.data as Frontmatter;
  const slug = path.basename(filePath, ".md");

  data.primaryKeyword = derivePrimaryKeyword(collection, data, slug);
  data.searchIntent = data.searchIntent ?? searchIntentByCollection[collection];
  data.title = normalizeTitle(data.title);
  data.description = normalizeDescription(data.description);
  data.reviewedAt = data.reviewedAt ?? data.updatedAt ?? TODAY;
  data.answers = normalizeAnswers(ensureAnswers(collection, data, slug), data);
  data.definitions = ensureDefinitions(collection, data);
  data.faqs = ensureFaqs(collection, data);
  data.tableData = ensureTable(collection, data);
  data.sources = deriveSources(collection, data, slug);

  const output = matter.stringify(file.content, scrubUndefined(data), {
    lineWidth: 80,
  });
  fs.writeFileSync(filePath, output);
}

for (const collection of Object.keys(searchIntentByCollection)) {
  const dirPath = path.join(CONTENT_ROOT, collection);
  for (const filePath of listMarkdownFiles(dirPath)) {
    normalizeFile(filePath, collection);
  }
}

console.log("Normalized public SEO content frontmatter.");
