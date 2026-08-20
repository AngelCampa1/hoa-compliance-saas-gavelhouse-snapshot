import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const PAGES_DIR = resolve(ROOT, "src/pages");

// Recursively collect every .astro page source.
function collectAstroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectAstroFiles(full));
    else if (entry.name.endsWith(".astro")) out.push(full);
  }
  return out;
}

// Capture every opening <div> tag that carries the b1-table-wrap class.
// `[^>]` matches across newlines, so multi-line attribute lists are included.
const TABLE_WRAP_TAG = /<div\b[^>]*\bb1-table-wrap\b[^>]*>/g;

describe("b1-table-wrap horizontal-scroll regions are keyboard accessible", () => {
  const files = collectAstroFiles(PAGES_DIR);

  it("finds the scrollable comparison-table wrappers in the page sources", () => {
    const total = files.reduce(
      (n, f) =>
        n + (readFileSync(f, "utf8").match(TABLE_WRAP_TAG)?.length ?? 0),
      0,
    );
    // Guards against the regex silently matching nothing (e.g. markup refactor).
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it("makes every b1-table-wrap focusable and labelled (WCAG 2.1.1)", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const tags = source.match(TABLE_WRAP_TAG) ?? [];
      for (const tag of tags) {
        expect(tag, `${file} table wrapper must be keyboard-focusable`).toMatch(
          /tabindex="0"/,
        );
        expect(tag, `${file} table wrapper must expose a region role`).toMatch(
          /role="region"/,
        );
        expect(
          tag,
          `${file} table wrapper must have an accessible name`,
        ).toMatch(/aria-label="[^"]+"/);
      }
    }
  });
});
