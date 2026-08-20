import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LINKEDIN_MAX_LENGTH = 3000;

const INTERNAL_REFERENCE_PATTERNS = [
  /\bnew\s+lead\s+magnet\b/i,
  /\blead\s+magnet\s*:/i,
  /\blead\s+magnet\s+library\b/i,
  /\bcontent\s+pillar\b/i,
  /\bcta\s+type\b/i,
  /\binternal\s+reference\b/i,
  /\bsource\s+url\s+or\s+repo\s+path\b/i,
];

const MISSING_MEDIA_PATTERNS = [
  /\[\s*(image|visual|graphic)\s+(suggestion|idea|prompt|description)\s*:/i,
  /\b(image|visual|graphic)\s+(suggestion|idea|prompt)\s*:/i,
  /\b(this|the)\s+(image|visual|graphic)\s+(shows|depicts|features)\b/i,
  /\b(use|create|insert|add)\s+(an?\s+)?(image|visual|graphic)\b/i,
];

const GENERIC_AI_PATTERNS = [
  /\bin today's\b/i,
  /\bseamless\b/i,
  /\brobust\b/i,
  /\bgame[- ]changing\b/i,
  /\bcutting[- ]edge\b/i,
  /\bleverage\b/i,
  /\bdelve\b/i,
  /\btapestry\b/i,
  /\bit is important to note\b/i,
];

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b|\bFIXME\b|\bTBD\b/i,
  /\[(?:insert|add|source|stat|citation|link|url|image|visual|graphic|placeholder)[^\]]*\]/i,
  /\{\{[^}]+\}\}/,
  /<\s*(?:insert|add|source|stat|citation|link|url|placeholder)[^>]*>/i,
];

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

export function normalizeLinkedInContent(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

export function reviewLinkedInPost({
  id,
  content,
  attachments = [],
  metadata = {},
  source = "",
}) {
  const errors = [];
  const text = String(content || "").trim();
  const normalized = normalizeLinkedInContent(text);
  const mediaCount = Array.isArray(attachments)
    ? attachments.filter(Boolean).length
    : 0;

  if (!normalized) errors.push("empty LinkedIn post content");
  if (text.length > LINKEDIN_MAX_LENGTH) {
    errors.push(
      `content is ${text.length} characters; LinkedIn limit is ${LINKEDIN_MAX_LENGTH}`,
    );
  }

  for (const pattern of INTERNAL_REFERENCE_PATTERNS) {
    if (pattern.test(normalized)) {
      errors.push(`contains internal production language matching ${pattern}`);
    }
  }

  for (const pattern of MISSING_MEDIA_PATTERNS) {
    if (pattern.test(normalized)) {
      const isProductionInstruction =
        /suggestion|idea|prompt|description|use|create|insert|add/i.test(
          pattern.source,
        );
      if (isProductionInstruction || mediaCount === 0) {
        errors.push(
          mediaCount > 0
            ? `contains image-production instruction matching ${pattern}; remove it from the post body`
            : `describes or suggests an image but the Postiz payload has no image attachment (${pattern})`,
        );
      }
    }
  }

  for (const pattern of GENERIC_AI_PATTERNS) {
    if (pattern.test(normalized))
      errors.push(`generic AI-style phrase matching ${pattern}`);
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(normalized))
      errors.push(`contains placeholder text matching ${pattern}`);
  }

  const reviewStatus = metadata?.review_status ?? metadata?.reviewStatus;
  if (
    reviewStatus !== undefined &&
    !/(passed|approved|reviewed|ready[_ -]?to[_ -]?schedule)/i.test(
      String(reviewStatus),
    )
  ) {
    errors.push(`review_status is ${reviewStatus}`);
  }

  const humanizerStatus =
    metadata?.humanizer_status ?? metadata?.humanizerStatus;
  if (humanizerStatus !== undefined && String(humanizerStatus) !== "passed") {
    errors.push(`humanizer_status is ${humanizerStatus}`);
  }

  const claimSources = metadata?.claim_sources ?? metadata?.claimSources;
  if (
    claimSources !== undefined &&
    (!Array.isArray(claimSources) || claimSources.length === 0)
  ) {
    errors.push("claim_sources must be a non-empty array when provided");
  }

  return {
    id: id || source || "(unknown post)",
    ok: errors.length === 0,
    errors,
    warnings: [],
  };
}

export function assertLinkedInPostsReviewed(posts) {
  const failures = [];
  const warnings = [];
  for (const post of posts) {
    const result = reviewLinkedInPost(post);
    for (const error of result.errors) failures.push(`${result.id}: ${error}`);
    for (const warning of result.warnings)
      warnings.push(`${result.id}: ${warning}`);
  }
  if (failures.length > 0) {
    throw new Error(
      `LinkedIn post review gate failed:\n- ${failures.join("\n- ")}`,
    );
  }
  return { warnings };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function postsFromJson(value, source) {
  const items = Array.isArray(value)
    ? value
    : value.posts || value.socialPost || [value];
  return items.flatMap((item, index) => {
    const id =
      item.id ||
      item.sourceId ||
      item.metadata?.sourceId ||
      `${source}#${index + 1}`;
    const content =
      item.content ||
      item.post_content ||
      item.post_text ||
      item.postsAndComments?.[0]?.content ||
      item.posts?.[0]?.value?.[0]?.content ||
      item.value?.[0]?.content ||
      "";
    const attachments =
      item.attachments ||
      item.postsAndComments?.[0]?.attachments ||
      item.posts?.[0]?.value?.[0]?.image ||
      item.value?.[0]?.image ||
      [];
    return [{ id, content, attachments, source }];
  });
}

function postsFromCsv(text, source) {
  const rows = parseCsv(text).filter((row) => row.some(Boolean));
  const header = rows.shift() || [];
  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  if (!("post_text" in idx) && !("post_content" in idx) && !("content" in idx))
    return [];
  return rows.map((row, index) => ({
    id: row[idx.id] || row[idx.post_number] || `${source}#${index + 1}`,
    content:
      row[idx.post_text] || row[idx.post_content] || row[idx.content] || "",
    attachments: [],
    source,
  }));
}

function markdownBody(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return (match ? match[1] : normalized).trim();
}

function postsFromPath(path) {
  const text = readFileSync(path, "utf8");
  const ext = extname(path).toLowerCase();
  if (ext === ".jsonl") {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .flatMap((line, index) =>
        postsFromJson(JSON.parse(line), `${path}:${index + 1}`),
      );
  }
  if (ext === ".json") return postsFromJson(JSON.parse(text), path);
  if (ext === ".csv") return postsFromCsv(text, path);
  if (ext === ".md" && basename(path).toLowerCase() !== "posts.md") return [];
  return [
    { id: path, content: markdownBody(text), attachments: [], source: path },
  ];
}

function walk(path) {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    return walk(join(path, entry.name));
  });
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error(
      "Usage: node scripts/linkedin-post-review-gate.mjs <file-or-dir> [...]",
    );
    process.exit(2);
  }

  const files = targets
    .flatMap((target) => walk(resolve(target)))
    .filter((path) =>
      [".txt", ".md", ".json", ".jsonl", ".csv"].includes(
        extname(path).toLowerCase(),
      ),
    );
  const posts = files.flatMap(postsFromPath);
  if (posts.length === 0) {
    console.error(
      `LinkedIn review gate found 0 posts in ${targets.join(", ")}`,
    );
    process.exit(1);
  }
  const failures = [];
  let warningCount = 0;

  for (const post of posts) {
    const result = reviewLinkedInPost(post);
    for (const error of result.errors) failures.push(`${result.id}: ${error}`);
    warningCount += result.warnings.length;
  }

  console.log(
    `LinkedIn review gate checked ${posts.length} posts from ${files.length} files.`,
  );
  if (warningCount) console.log(`Warnings: ${warningCount}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (invokedPath) main();
