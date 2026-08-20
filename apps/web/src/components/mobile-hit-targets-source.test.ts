import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

// Derive src/ from process.cwd() which is always apps/web in this test runner.
// (import.meta.url resolution is intercepted by jsdom's base URL, so we use
// process.cwd() + known relative path instead.)
function getSrcDir(): string {
  return resolve(process.cwd(), "src");
}

// ---------------------------------------------------------------------------
// Phase B will remove entries from this list as each file is fixed.
// Each entry is a suffix of the path relative to src/ (forward slashes).
// ---------------------------------------------------------------------------
const KNOWN_VIOLATIONS_TO_FIX_IN_PHASE_B: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function walkAstro(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkAstro(full));
    } else if (entry.endsWith(".astro")) {
      results.push(full);
    }
  }
  return results;
}

function relToSrc(abs: string, srcDir: string): string {
  const base = normPath(srcDir).replace(/\/$/, "");
  return normPath(abs).replace(base + "/", "");
}

function isKnownViolator(abs: string, srcDir: string): boolean {
  const rel = relToSrc(abs, srcDir);
  return KNOWN_VIOLATIONS_TO_FIX_IN_PHASE_B.some((v) => rel.endsWith(v));
}

// Selectors that must have ≥44px min-height when they are interactive
const INTERACTIVE_SELECTOR_RE =
  /(?:^|\s|,)(?:a|button|summary|\[role="button"\]|[^{}]*(?:__link|__button|-link|-button|-btn))(?:\s*[:.[{,]|$)/;

function findShortMinHeightViolations(source: string): string[] {
  const violations: string[] = [];
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(source)) !== null) {
    const selector = block[1].trim();
    const body = block[2];
    const heightMatch = /min-height:\s*(\d+)px/.exec(body);
    if (heightMatch) {
      const px = parseInt(heightMatch[1], 10);
      if (px < 44 && INTERACTIVE_SELECTOR_RE.test(selector)) {
        violations.push(
          `selector "${selector}" has min-height: ${px}px (< 44)`,
        );
      }
    }
  }
  return violations;
}

// Pattern: font-size: 14px or 15px on input/select/textarea selectors
const INPUT_SELECTOR_RE =
  /(?:^|\s|,)(?:input|select|textarea|[^{}]*(?:__input|__select|__textarea|-input))(?:\s*[:.[{,]|$)/;

function findSmallFontSizeViolations(source: string): string[] {
  const violations: string[] = [];
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(source)) !== null) {
    const selector = block[1].trim();
    const body = block[2];
    const fontMatch = /font-size:\s*(1[45])px/.exec(body);
    if (fontMatch && INPUT_SELECTOR_RE.test(selector)) {
      violations.push(
        `selector "${selector}" has font-size: ${fontMatch[1]}px (iOS zoom risk)`,
      );
    }
  }
  return violations;
}

const MAX_WIDTH_RE = /@media\s*\(max-width:/;

function hasMaxWidthMediaQuery(source: string): boolean {
  return MAX_WIDTH_RE.test(source);
}

// ---------------------------------------------------------------------------
// Original regression suite (kept intact)
// ---------------------------------------------------------------------------

describe("shared mobile hit target regressions", () => {
  it("keeps the mobile header brand and nav trigger at 44px minimum targets", () => {
    const source = readSource("./site-header.astro");

    expect(source).toContain("min-height: 44px");
    expect(source).toContain("width: 44px");
    expect(source).toContain("b1-site-nav__brand");
  });

  it("keeps footer links large enough for touch interaction", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("min-height: 44px");
    expect(source).toContain("min-width: 44px");
    expect(source).toContain("inline-flex");
  });

  it("keeps breadcrumb links at a minimum mobile tap target", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("min-h-11");
    expect(source).toContain("min-w-11");
    expect(source).toContain("inline-flex");
  });

  it("keeps promotional CTA links pill shaped", () => {
    const promoBar = readSource("./promo-bar.astro");
    const siteHeader = readSource("./site-header.astro");

    expect(promoBar).toMatch(
      /\.b1-promo-bar__cta-link\s*\{[\s\S]*border-radius:\s*999/,
    );
    expect(siteHeader).toContain('class="b1-site-nav__mobile-cta"');
    expect(siteHeader).toMatch(
      /\.b1-site-nav__mobile-cta\s*\{[\s\S]*border-radius:\s*999/,
    );
  });
});

// ---------------------------------------------------------------------------
// Expanded invariants — whole components + layouts scan
// ---------------------------------------------------------------------------

describe("mobile-first invariants across all components and layouts", () => {
  it("no interactive selector has min-height < 44px", () => {
    const srcDir = getSrcDir();
    const allFiles = [
      ...walkAstro(join(srcDir, "components")),
      ...walkAstro(join(srcDir, "layouts")),
    ];
    const fileViolations: string[] = [];

    for (const file of allFiles) {
      if (isKnownViolator(file, srcDir)) continue;
      const source = readFileSync(file, "utf8");
      const violations = findShortMinHeightViolations(source);
      if (violations.length > 0) {
        fileViolations.push(
          `${relToSrc(file, srcDir)}: ${violations.join("; ")}`,
        );
      }
    }

    expect(fileViolations).toEqual([]);
  });

  it("no input/select/textarea selector has font-size 14px or 15px", () => {
    const srcDir = getSrcDir();
    const allFiles = [
      ...walkAstro(join(srcDir, "components")),
      ...walkAstro(join(srcDir, "layouts")),
    ];
    const fileViolations: string[] = [];

    for (const file of allFiles) {
      if (isKnownViolator(file, srcDir)) continue;
      const source = readFileSync(file, "utf8");
      const violations = findSmallFontSizeViolations(source);
      if (violations.length > 0) {
        fileViolations.push(
          `${relToSrc(file, srcDir)}: ${violations.join("; ")}`,
        );
      }
    }

    expect(fileViolations).toEqual([]);
  });

  it("no @media (max-width: query exists in components or layouts (mobile-first only)", () => {
    const srcDir = getSrcDir();
    const allFiles = [
      ...walkAstro(join(srcDir, "components")),
      ...walkAstro(join(srcDir, "layouts")),
    ];
    const fileViolations: string[] = [];

    for (const file of allFiles) {
      if (isKnownViolator(file, srcDir)) continue;
      const source = readFileSync(file, "utf8");
      if (hasMaxWidthMediaQuery(source)) {
        fileViolations.push(relToSrc(file, srcDir));
      }
    }

    expect(fileViolations).toEqual([]);
  });

  it("global.css has no @media (max-width: query", () => {
    const srcDir = getSrcDir();
    const globalCss = readFileSync(
      join(srcDir, "styles", "global.css"),
      "utf8",
    );
    expect(globalCss).not.toMatch(MAX_WIDTH_RE);
  });
});
