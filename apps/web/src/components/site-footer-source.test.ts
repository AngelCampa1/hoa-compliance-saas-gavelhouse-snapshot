import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("site footer source regressions", () => {
  it("uses mobile-safe hit areas for footer navigation links", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("min-height: 44px");
    expect(source).toContain("align-items: center");
  });

  it("contact link uses mailto: scheme so email clients open on click", () => {
    const source = readSource("./site-footer.astro");

    // The email link must open an email composer, not navigate to /contact/
    expect(source).toContain("mailto:");
    expect(source).toContain("{contactEmail}");
  });

  it("uses the Gavelhouse logo mark instead of the old BS fallback", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("BrandLogoMark");
    expect(source).toContain("b1-site-footer__wordmark");
    expect(source).toContain("<span>Gavel</span><span>house</span>");
    expect(source).not.toContain(">BS<");
  });
});
