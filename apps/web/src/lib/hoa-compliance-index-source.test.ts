import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readWebSource(path: string): string {
  return readFileSync(resolve(root, "src", path), "utf8");
}

function readPublishedStatePages() {
  const statePagesRoot = resolve(root, "src/content/state-pages");

  return readdirSync(statePagesRoot)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const source = readFileSync(resolve(statePagesRoot, file), "utf8");
      const { data } = matter(source);
      return {
        slug: file.replace(/\.md$/, ""),
        state: String(data.state),
        stateCode: String(data.stateCode),
      };
    });
}

describe("HOA compliance index source", () => {
  it("does not label published state pages as queued", () => {
    const source = readWebSource("pages/hoa-compliance/index.astro");
    const publishedStates = readPublishedStatePages();

    expect(publishedStates.length).toBeGreaterThan(0);
    expect(source).toContain('getCollection("state-pages")');
    expect(source).toContain("href={`/hoa-compliance/${entry.slug}/`}");
    expect(source).not.toContain("Queued");
    expect(source).not.toContain("const coming");

    for (const page of publishedStates) {
      expect(source).not.toMatch(
        new RegExp(
          `\\["${page.stateCode}",\\s*"${page.state}"\\][\\s\\S]*?Queued`,
        ),
      );
    }
  });

  it("does not publish the old unsupported state comparison table", () => {
    const source = readWebSource("pages/hoa-compliance/index.astro");

    expect(source).not.toContain("<th>Control</th>");
    expect(source).not.toMatch(/<th>CA<\/th><th>FL<\/th><th>TX<\/th>/);
    expect(source).not.toContain('"Reserve study"');
    expect(source).not.toContain('"Fund separation"');
    expect(source).not.toContain('"Budget disclosure"');
    expect(source).not.toContain('"CPA audit threshold"');
    expect(source).not.toMatch(/<td>Partial<\/td>/);
    expect(source).toContain("Request a deeper summary");
    expect(source).toContain("href={`/hoa-compliance/${entry.slug}/`}");
  });
});
