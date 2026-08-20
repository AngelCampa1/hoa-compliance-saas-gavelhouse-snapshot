#!/usr/bin/env node
/**
 * lint-linkedin-posts.mjs
 *
 * Validates every .md file under content/linkedin/posts/ against the
 * Gavelhouse LinkedIn content rules. Run after every generation/review stage.
 *
 * Usage:
 *   node scripts/lint-linkedin-posts.mjs
 *   node scripts/lint-linkedin-posts.mjs --verbose
 *
 * Exit 0 = all clean. Exit 1 = failures found (with file:line details).
 */

import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { reviewLinkedInPost } from "./linkedin-post-review-gate.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const POSTS_DIR = join(ROOT, "content", "linkedin", "posts");

const VERBOSE = process.argv.includes("--verbose");

// ─── RULES ──────────────────────────────────────────────────────────────────

const EM_DASH_PATTERNS = [
  { pattern: /—/g, name: "em dash (—)" },
  { pattern: /–/g, name: "en dash (–)" },
  { pattern: /(?<!\bhttps?:)\/\//g, name: "double slash in body (not URL)" },
];

// Only flag -- in body text, not in frontmatter YAML or URLs
const DOUBLE_HYPHEN_PATTERN = /(?<!https?:)(?<![a-z])--(?![a-z])/gi;

const BANNED_PHRASES = [
  "it's worth noting",
  "worth noting",
  "in today's fast-paced world",
  "today's landscape",
  "in conclusion",
  "to summarize",
  "let's dive in",
  "dive into",
  "navigate the",
  "navigating the",
  "leverage the",
  "leveraging the",
  "delve",
  "delving",
  "tapestry",
  "in the realm of",
  "in the world of",
  "it is important to note",
  "at the end of the day",
  "moving forward",
  "game-changer",
  "game-changing",
  "cutting-edge",
  "robust solution",
  "seamless solution",
  "seamless experience",
  "not just .{0,40} but",
  "in today's",
  "ensure that",
  "utilize",
  "utilizing",
];

const REQUIRED_FRONTMATTER_FIELDS = [
  "id",
  "scheduledAt",
  "channel",
  "pillar",
  "hook",
];

const VALID_PILLARS = [
  "state-compliance",
  "reserve-mechanics",
  "anti-quickbooks",
  "competitor-commentary",
  "board-liability",
  "builder-pov",
  "board-ops",
  "lead-magnet",
  "fannie-mae",
  "faq",
];

const MIN_WORDS = 30;
const MAX_WORDS = 250;
const MAX_HASHTAGS = 3;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content, raw: "" };
  const raw = match[1];
  const body = match[2] || "";
  const frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) frontmatter[m[1]] = m[2].trim();
  }
  return { frontmatter, body, raw };
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countHashtags(text) {
  return (text.match(/#[a-zA-Z]\w*/g) || []).length;
}

// ─── LINT ONE FILE ────────────────────────────────────────────────────────────

function lintFile(filePath) {
  const content = readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  const filename = filePath.split(/[\\/]/).pop();
  const errors = [];

  const { frontmatter, body } = parseFrontmatter(content);

  // 1. Frontmatter completeness
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!frontmatter[field]) {
      errors.push(`Missing required frontmatter field: ${field}`);
    }
  }

  // 2. Valid channel
  if (frontmatter.channel && frontmatter.channel !== "company") {
    errors.push(`Invalid channel "${frontmatter.channel}" — must be "company"`);
  }

  // 3. Valid pillar
  if (frontmatter.pillar && !VALID_PILLARS.includes(frontmatter.pillar)) {
    errors.push(
      `Invalid pillar "${frontmatter.pillar}" — must be one of: ${VALID_PILLARS.join(",")}`,
    );
  }

  // 4. scheduledAt format
  if (
    frontmatter.scheduledAt &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(
      frontmatter.scheduledAt,
    )
  ) {
    errors.push(
      `Invalid scheduledAt format "${frontmatter.scheduledAt}" — expected YYYY-MM-DDTHH:MM:SS-HH:MM`,
    );
  }

  // 5. Em dashes in body
  for (const { pattern, name } of EM_DASH_PATTERNS) {
    const matches = body.match(pattern);
    if (matches) {
      errors.push(`Contains ${name} (${matches.length}x) in body`);
    }
  }

  // 6. Double hyphens in body (skip frontmatter YAML lines and URLs)
  const bodyLines = body.split("\n");
  bodyLines.forEach((line, i) => {
    if (/https?:\/\//.test(line)) return;
    if (DOUBLE_HYPHEN_PATTERN.test(line)) {
      errors.push(
        `Line ${i + 1} in body contains "--" (use a period or comma instead)`,
      );
    }
    DOUBLE_HYPHEN_PATTERN.lastIndex = 0;
  });

  // 7. Banned phrases (case-insensitive, in body)
  const bodyLower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(phrase, "i");
    if (re.test(bodyLower)) {
      errors.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // 8. Word count
  const wordCount = countWords(body);
  if (wordCount < MIN_WORDS) {
    errors.push(`Body too short: ${wordCount} words (min ${MIN_WORDS})`);
  }
  if (wordCount > MAX_WORDS) {
    errors.push(`Body too long: ${wordCount} words (max ${MAX_WORDS})`);
  }

  // 9. Hashtag count
  const hashtagCount = countHashtags(body);
  if (hashtagCount > MAX_HASHTAGS) {
    errors.push(`Too many hashtags: ${hashtagCount} (max ${MAX_HASHTAGS})`);
  }

  // 10. No inline-cite blocks in published posts (strip before publishing)
  if (body.includes("# inline-cite")) {
    errors.push(
      "Contains unpublished # inline-cite block — strip before publishing",
    );
  }

  const review = reviewLinkedInPost({
    id: filename,
    content: body,
    attachments: [],
    source: filePath,
  });
  errors.push(...review.errors);

  return { filename, errors };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  let files;
  try {
    files = readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    console.error(`Error: posts directory not found at ${POSTS_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("No .md files found in posts directory.");
    process.exit(0);
  }

  let totalErrors = 0;
  let filesWithErrors = 0;
  const results = [];

  for (const file of files) {
    const filePath = join(POSTS_DIR, file);
    const { filename, errors } = lintFile(filePath);
    results.push({ filename, errors });
    if (errors.length > 0) {
      filesWithErrors++;
      totalErrors += errors.length;
    }
  }

  // Report
  if (VERBOSE || totalErrors > 0) {
    for (const { filename, errors } of results) {
      if (errors.length === 0) {
        if (VERBOSE) console.log(`  PASS  ${filename}`);
        continue;
      }
      console.log(`\n  FAIL  ${filename}`);
      for (const e of errors) {
        console.log(`        - ${e}`);
      }
    }
  }

  console.log(
    `\n${files.length} files checked. ${filesWithErrors} failed, ${totalErrors} errors total.`,
  );

  if (totalErrors > 0) {
    process.exit(1);
  } else {
    console.log("All posts passed lint.");
    process.exit(0);
  }
}

main();
