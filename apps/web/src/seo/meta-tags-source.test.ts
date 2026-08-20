import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("meta tags source regressions", () => {
  it("preserves shared truncation by default and only bypasses it when explicitly requested", () => {
    const source = readSource("./meta-tags.astro");

    expect(source).toContain("truncateMetaTitle");
    expect(source).toContain("truncateMetaDescription");
    expect(source).toContain(
      "const metaTitle = preserveAuthoredMetadata ? title : truncateMetaTitle(title)",
    );
    expect(source).toContain(
      "const metaDescription = preserveAuthoredMetadata",
    );
    expect(source).toContain(": truncateMetaDescription(description)");
  });
});
