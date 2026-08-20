import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { LEAD_MAGNET_SLUGS } from "@boardstack/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("lead magnet page source regressions", () => {
  it("has a shared/API slug for every lead magnet content page", () => {
    const contentDir = path.resolve(__dirname, "..", "content", "lead-magnets");
    const contentSlugs = readdirSync(contentDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(0, -".md".length))
      .sort();

    expect(contentSlugs).toEqual([...LEAD_MAGNET_SLUGS].sort());
  });

  it("renders visible FAQ content when faq schema is emitted", () => {
    const source = readSource("./lead-magnet-page.astro");

    expect(source).toContain("mergeFaqSources(");
    expect(source).toContain("<FaqSection");
    expect(source).toContain("faqs={data.faqs}");
    expect(source).toContain("<AnswerBlock");
    expect(source).toContain("emitSchema={false}");
  });

  it("renders related-page links for lead magnet detail pages", () => {
    const source = readSource("./lead-magnet-page.astro");

    expect(source).toContain("import RelatedPages");
    expect(source).toContain("resolveRelatedPageLinks(");
    expect(source).toContain("buildContentMap(");
    expect(source).toContain("<RelatedPages");
    expect(source).toContain("pages={relatedLinks}");
  });
});
