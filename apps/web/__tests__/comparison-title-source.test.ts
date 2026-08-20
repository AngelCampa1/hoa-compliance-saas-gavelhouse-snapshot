import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const COMPARISONS_DIR = resolve(ROOT, "src/content/comparisons");

function readFrontmatter(file: string): string {
  const source = readFileSync(resolve(COMPARISONS_DIR, file), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match?.[1] ?? "";
}

function readTitle(file: string): string {
  const fm = readFrontmatter(file);
  const line = fm.split(/\r?\n/).find((l) => /^title:/.test(l));
  if (!line) return "";
  // Strip the leading `title:` key and any surrounding quotes.
  return line
    .replace(/^title:\s*/, "")
    .replace(/^["']/, "")
    .replace(/["']\s*$/, "")
    .trim();
}

const comparisonFiles = readdirSync(COMPARISONS_DIR).filter((f) =>
  f.endsWith(".md"),
);

describe("comparison page titles are complete, not truncated", () => {
  it("has at least one comparison file to check", () => {
    expect(comparisonFiles.length).toBeGreaterThan(0);
  });

  for (const file of comparisonFiles) {
    describe(file, () => {
      const title = readTitle(file);

      it("has a non-empty title", () => {
        expect(title.length).toBeGreaterThan(0);
      });

      it("does not end with a dangling separator (truncated subtitle)", () => {
        // A title that ends with ":" or "-" lost its subtitle to truncation,
        // e.g. "MoneyMinder vs QuickBooks for HOA Accounting (2026):".
        expect(title).not.toMatch(/[:-]\s*$/);
      });

      it("does not end mid-fragment right after the year", () => {
        // Guards the specific truncation we saw — a stray word left after
        // "(2026):" once the colon is gone, e.g. "...(2026) Fund" / "...Why".
        // A complete title either ends at the year (empty tail) or continues
        // with a real subtitle of more than one word; a lone trailing word is
        // the truncation artifact. Asserted unconditionally so the check can
        // never be vacuously skipped.
        const afterYear = title.match(/\(2026\)\s*:?\s*(.*)$/);
        const tail = afterYear ? afterYear[1].trim() : "";
        const isTruncatedFragment =
          tail.length > 0 && tail.split(/\s+/).length === 1;
        expect(isTruncatedFragment).toBe(false);
      });
    });
  }
});
