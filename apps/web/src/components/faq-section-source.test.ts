import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("faq section source regressions", () => {
  it("keeps FAQ items collapsed by default unless a page opts in", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toContain("defaultOpenCount = 0");
    expect(source).toContain("open={index < defaultOpenCount || undefined}");
    expect(source).not.toContain("defaultOpenCount = 3");
  });

  it("defaults emitSchema to false to avoid duplicate FAQPage schema when layouts already emit it", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toMatch(/emitSchema\s*=\s*false/);
    expect(source).not.toMatch(/emitSchema\s*=\s*true/);
  });
});
