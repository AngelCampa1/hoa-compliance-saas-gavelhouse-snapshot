import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readWebSource(relativePath: string): string {
  return readFileSync(`src/${relativePath}`, "utf8").replace(/\r\n/g, "\n");
}

describe("B1 Memo SEO template layout source", () => {
  it("renders comparison pages with a redline hero and verdict structure", () => {
    const source = readWebSource("layouts/comparison-layout.astro");

    expect(source).toContain("redline-block");
    expect(source).toContain("b1-verdict");
    expect(source).toContain("Honest take");
  });

  it("renders article/content pages with B1 statute/calendar/detail components", () => {
    const source = readWebSource("layouts/content-layout.astro");

    expect(source).toContain("b1-template-article");
    expect(source).toContain("compliance calendar");
    expect(source).toContain("statute-card");
  });

  it("renders guide pages with deep editorial header and sticky toc", () => {
    const source = readWebSource("layouts/article-layout.astro");

    expect(source).toContain("b1-guide-header");
    expect(source).toContain("sticky-toc");
    expect(source).toContain("Angel Campa");
  });

  it("renders listicles with rubric and score dots", () => {
    const source = readWebSource("layouts/listicle-layout.astro");

    expect(source).toContain("Scoring rubric");
    expect(source).toContain("score-dots");
  });

  it("renders pricing breakdowns with a calculator instrument", () => {
    const source = readWebSource("layouts/pricing-breakdown-layout.astro");

    expect(source).toContain("calculator-instrument");
    expect(source).toContain("Gavelhouse wins");
  });

  it("renders lead magnets with document preview and gated form", () => {
    const source = readWebSource("components/lead-magnet-page.astro");

    expect(source).toContain("document-preview");
    expect(source).toContain("gated-form");
    expect(source).toContain("Free");
  });
});
