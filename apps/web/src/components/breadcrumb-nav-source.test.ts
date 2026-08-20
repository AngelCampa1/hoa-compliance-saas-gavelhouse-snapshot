import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("breadcrumb nav source regressions", () => {
  it("keeps mobile horizontal scrolling available while hiding the visual scrollbar", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("[scrollbar-width:none]");
    expect(source).toContain("[&::-webkit-scrollbar]:hidden");
    expect(source).not.toContain("overflow-hidden sm:overflow-x-auto");
  });

  it("lets the current breadcrumb wrap on mobile instead of truncating it", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("max-sm:w-full");
    expect(source).toContain("max-sm:whitespace-normal");
    expect(source).toContain("break-words");
    expect(source).not.toContain("max-w-[220px] truncate");
  });

  it("gives breadcrumb links a mobile-safe minimum hit area", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("inline-flex min-h-11 min-w-11");
    expect(source).toContain("items-center");
  });

  it("allows layouts with identity graphs to opt out of BreadcrumbList schema emission", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toMatch(/emitSchema\s*=\s*true/);
    expect(source).toContain(
      "{emitSchema && <SchemaMarkup schemas={[breadcrumbSchema]} />}",
    );
  });
});
