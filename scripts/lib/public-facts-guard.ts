import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BRAND_CONTACT_EMAIL,
  BRAND_DOMAIN,
  BRAND_NAME,
  GUARANTEE_CONFIG,
  LIMITED_SUBSCRIPTION_PROMO,
  PUBLIC_API_URL,
  PUBLIC_APP_URL,
  PUBLIC_WEB_URL,
  PRODUCT_PRICE,
  TRIAL_DURATION_DAYS,
  getAnnualPricingRangeLabel,
  getDiscountedDisplayPrice,
} from "../../packages/shared/src/index.js";

export type PublicFactFinding = {
  file: string;
  line: number;
  message: string;
  text: string;
};

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".css",
  ".html",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".toml",
]);

const EXCLUDED_PATH_PATTERNS = [
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^pnpm-lock\.yaml$/,
  /^agents\//,
  /^packages\/shared\/generated\/knowledge\//,
  /^apps\/api\/migrations\//,
  /^apps\/api\/scripts\/seed-(dev|demo)\.ts$/,
  /^apps\/app\/e2e\//,
  /^apps\/web\/public\//,
  /^apps\/(api|app|web)\/wrangler\.toml$/,
  /^coverage\//,
  /^marketing-indexing-urls\.txt$/,
  /^node_modules\//,
  /(^|\/)__tests__\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /^content\/linkedin\//,
  /^content\/linkedin\/posts\//,
  /^content\/linkedin\/_internal\/june-2026-fragments\//,
  /^docs\/marketing redesign\//,
  /^docs\/engineering\/qa-history\//,
  /^scripts\/lib\/public-facts-guard\.ts$/,
  /^scripts\/lib\/public-facts-guard\.test\.ts$/,
];

const LEGACY_REDIRECT_PATHS = new Set([
  "apps/web/src/lib/worker-wrapper.ts",
  "apps/web/src/lib/worker-wrapper.test.ts",
  "apps/web/src/middleware.ts",
  "apps/web/src/middleware.test.ts",
  "apps/web/src/lib/public-runtime-urls.ts",
  "apps/web/wrangler.toml",
]);

const INTERNAL_BOARDSTACK_PATTERNS = [
  /@boardstack\//,
  /"@boardstack\/[a-z-]+"/,
  /boardstack-(api|app|web|shared|design|scripts)\b/,
  /\bboardstack-governance\b/,
  /\bboardstack-audit-packs\b/,
  /\bboardstack-ai-sdr-nonces\b/,
  /\bboardstack-prod\b/,
  /\bboardstack-server\b/,
  // The source repository URL under the current public account. The
  // repository is exempt because its name is "boardstack" regardless of what
  // the product ended up being called.
  /github\.com\/AngelCampa1\/boardstack/,
  /D:\\code\\boardstack/i,
  /C:\\Users\\Angel\\Documents\\boardstack/i,
];

const RETIRED_PUBLIC_BRAND_PATTERNS = [
  /\bPebbledesk\b/i,
  /\bPebbleDesk\b/,
  /\bpebbledesk\b/i,
  /\bBoardStack\b/,
  /\bBoardstack\b/,
  /@boardstackhq\b/i,
  /\b(?:www\.|my\.|api\.)?boardstack\.app\b/i,
];

const STALE_TRIAL_OR_OFFER_PATTERNS = [
  /\$29\/mo billed annually/i,
  /\$79\/mo billed annually/i,
  /\$149\/mo billed annually/i,
  /\$299\/mo billed annually/i,
];

const canonicalGavelhousePrices = new Set([
  getDiscountedDisplayPrice("starter", "annual"),
  getDiscountedDisplayPrice("growth", "annual"),
  getDiscountedDisplayPrice("scale", "annual"),
  getAnnualPricingRangeLabel(["starter", "scale"]).split(" billed ")[0],
  getAnnualPricingRangeLabel(["growth", "scale"]).split(" billed ")[0],
]);

const SOURCE_CODE_EXTENSIONS = new Set([".astro", ".mjs", ".ts", ".tsx"]);
const TRIAL_DURATION_PATTERN = /\b(\d+)-(day|month) free trial\b/i;
const MONEY_BACK_GUARANTEE_PATTERN = /\b(\d+)-day money-back guarantee\b/i;
const OFFER_PERCENT_PATTERN = /\b(\d+)% off your first year\b/i;
const OFFER_CODE_PATTERN = /\b[A-Z][0-9]{2}OFF\b/g;
const STALE_PUBLIC_PRICE_PATTERN =
  /\$20-\$99\/(?:mo|month)\b|\$20-\$99\/mo flat by community size\b/i;

export function listTrackedTextFiles(cwd: string): string[] {
  const output = execFileSync("git", ["ls-files"], {
    cwd,
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => TEXT_EXTENSIONS.has(path.extname(file)))
    .filter((file) => existsSync(path.join(cwd, file)))
    .filter(
      (file) => !EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(file)),
    );
}

export function findPublicFactViolations(
  cwd: string,
  files = listTrackedTextFiles(cwd),
): PublicFactFinding[] {
  const findings: PublicFactFinding[] = [];
  for (const file of files) {
    const text = readFileSync(path.join(cwd, file), "utf8");
    findings.push(...scanPublicFactText(file, text));
  }
  return findings;
}

export function scanPublicFactText(
  file: string,
  text: string,
): PublicFactFinding[] {
  const lines = text.split(/\r?\n/);
  return lines.flatMap((lineText, index) =>
    scanLine(file, index + 1, lineText, lines),
  );
}

function scanLine(
  file: string,
  line: number,
  text: string,
  lines: string[] = [text],
): PublicFactFinding[] {
  const findings: PublicFactFinding[] = [];
  const nearbyText = lines
    .slice(Math.max(0, line - 3), Math.min(lines.length, line + 2))
    .join(" ");

  for (const pattern of RETIRED_PUBLIC_BRAND_PATTERNS) {
    if (!pattern.test(text)) continue;
    if (isAllowedBoardstackReference(file, text)) continue;
    findings.push({
      file,
      line,
      message: "Retired public brand/domain reference is not allowed.",
      text,
    });
  }

  for (const pattern of STALE_TRIAL_OR_OFFER_PATTERNS) {
    if (!pattern.test(text)) continue;
    findings.push({
      file,
      line,
      message: "Stale trial, offer, or list-price language is not allowed.",
      text,
    });
  }

  const trialDurationMatch = TRIAL_DURATION_PATTERN.exec(text);
  if (trialDurationMatch) {
    const amount = Number(trialDurationMatch[1]);
    const unit = trialDurationMatch[2]?.toLowerCase();
    if (unit !== "day" || amount !== TRIAL_DURATION_DAYS) {
      findings.push({
        file,
        line,
        message: `Trial duration should use the shared ${TRIAL_DURATION_DAYS}-day value.`,
        text,
      });
    }
  }

  const guaranteeMatch = MONEY_BACK_GUARANTEE_PATTERN.exec(text);
  if (guaranteeMatch && Number(guaranteeMatch[1]) !== GUARANTEE_CONFIG.days) {
    findings.push({
      file,
      line,
      message: `Money-back guarantee should use the shared ${GUARANTEE_CONFIG.days}-day value.`,
      text,
    });
  }

  const offerPercentMatch = OFFER_PERCENT_PATTERN.exec(text);
  if (
    offerPercentMatch &&
    Number(offerPercentMatch[1]) !== LIMITED_SUBSCRIPTION_PROMO.percentOff
  ) {
    findings.push({
      file,
      line,
      message: `Limited-offer percent should use the shared ${LIMITED_SUBSCRIPTION_PROMO.percentOff}% value.`,
      text,
    });
  }

  for (const codeMatch of text.matchAll(OFFER_CODE_PATTERN)) {
    const code = codeMatch[0];
    const allowedCodes: readonly string[] = [
      LIMITED_SUBSCRIPTION_PROMO.monthly.code,
      LIMITED_SUBSCRIPTION_PROMO.annual.code,
    ];
    if (allowedCodes.includes(code)) continue;
    findings.push({
      file,
      line,
      message: `Unknown limited-offer code "${code}" should come from shared pricing helpers.`,
      text,
    });
  }

  if (
    STALE_PUBLIC_PRICE_PATTERN.test(text) &&
    /\bGavelhouse\b/.test(nearbyText)
  ) {
    findings.push({
      file,
      line,
      message: `Stale public pricing should use shared PRODUCT_PRICE (${PRODUCT_PRICE}).`,
      text,
    });
  }

  const brandMatches = nearbyText.matchAll(/\bGavelhouse\b/g);
  for (const brandMatch of brandMatches) {
    const gavelhouseText = nearbyText.slice(brandMatch.index);
    const sentenceEnd = gavelhouseText.search(/[.!?](?:\s|$)/);
    const gavelhouseClause =
      sentenceEnd >= 0
        ? gavelhouseText.slice(0, sentenceEnd + 1)
        : gavelhouseText.slice(0, 260);
    const priceMatches = gavelhouseClause.matchAll(
      /\$[0-9][0-9,.]*(?:-\$?[0-9][0-9,.]*)?\/(?:mo|month)\b/gi,
    );
    for (const match of priceMatches) {
      if (!looksLikeGavelhousePriceClaim(gavelhouseClause, match.index)) {
        continue;
      }
      const price = match[0];
      const normalized = price.replace(/\/month$/i, "/mo");
      if (canonicalGavelhousePrices.has(normalized)) continue;
      findings.push({
        file,
        line,
        message: `Non-canonical ${BRAND_NAME} price "${price}" should come from shared pricing helpers.`,
        text,
      });
    }
  }

  for (const literal of [
    BRAND_DOMAIN,
    BRAND_CONTACT_EMAIL,
    PUBLIC_WEB_URL,
    PUBLIC_APP_URL,
    PUBLIC_API_URL,
  ]) {
    if (!text.includes(literal)) continue;
    if (!SOURCE_CODE_EXTENSIONS.has(path.extname(file))) continue;
    if (LEGACY_REDIRECT_PATHS.has(file)) continue;
    if (isCommentOnlyLine(text)) continue;
    if (file.startsWith("packages/shared/src/knowledge/")) continue;
    if (file.startsWith("packages/shared/__tests__/")) continue;
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    if (file.startsWith("docs/")) continue;
    findings.push({
      file,
      line,
      message: `Public literal "${literal}" should be imported from @boardstack/shared.`,
      text,
    });
  }

  return findings;
}

function isAllowedBoardstackReference(file: string, text: string): boolean {
  if (LEGACY_REDIRECT_PATHS.has(file)) return true;
  return INTERNAL_BOARDSTACK_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeGavelhousePriceClaim(
  text: string,
  priceIndex: number,
): boolean {
  const beforePrice = text.slice(0, priceIndex);
  const normalizedBeforePrice = beforePrice.toLowerCase();
  if (
    normalizedBeforePrice.includes("per-unit platforms") ||
    normalizedBeforePrice.includes("per-unit tools") ||
    normalizedBeforePrice.includes("cost delta")
  ) {
    return false;
  }

  const gavelhouseSubjectClaim =
    /\bGavelhouse(?:'s)?(?:\s+[\w-]+){0,5}\s+(?:annual plans from|starts|costs|charges|stays|runs|is|covers|provides|offers|has)\b/i;
  if (!gavelhouseSubjectClaim.test(beforePrice)) {
    return false;
  }

  const lastComparison = Math.max(
    beforePrice.lastIndexOf(" versus "),
    beforePrice.lastIndexOf(" vs "),
    beforePrice.lastIndexOf(" compared "),
    beforePrice.lastIndexOf(" while "),
  );
  const lastClaimVerb = Math.max(
    beforePrice.lastIndexOf(" starts "),
    beforePrice.lastIndexOf(" costs "),
    beforePrice.lastIndexOf(" charges "),
    beforePrice.lastIndexOf(" pricing "),
    beforePrice.lastIndexOf(" price "),
    beforePrice.lastIndexOf(" plans "),
    beforePrice.lastIndexOf(" tier "),
    beforePrice.lastIndexOf(" is "),
    beforePrice.lastIndexOf(" at about "),
  );
  return lastClaimVerb >= 0 && lastClaimVerb > lastComparison;
}

function isCommentOnlyLine(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}
