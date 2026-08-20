import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("help center index source polish", () => {
  const source = read("_app.help.tsx");
  const flat = normalize(source);

  it("uses a typed route to the topic page instead of a stringified cast", () => {
    expect(flat).toContain('to="/help/$slug"');
    expect(flat).toContain("params={{ slug: topic.id }}");
    expect(source).not.toContain("`/help/${topic.id}`");
  });

  it("passes the required search param so the typed link typechecks", () => {
    expect(flat).toContain(
      'to="/help/$slug" params={{ slug: topic.id }} search={{ role: undefined }}',
    );
  });

  it("hides decorative icons from assistive tech", () => {
    expect(flat).toContain('<Search aria-hidden="true"');
    expect(flat).toContain('<BookOpen aria-hidden="true"');
  });
});

describe("help center topic source polish", () => {
  const source = read("_app.help.$slug.tsx");
  const flat = normalize(source);

  it("hides the back-arrow icon from assistive tech", () => {
    expect(flat).toContain(
      '<ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />',
    );
  });

  it("labels the related-area link with its destination title", () => {
    expect(flat).toContain("aria-label={`Open ${help.title}`}");
  });
});
