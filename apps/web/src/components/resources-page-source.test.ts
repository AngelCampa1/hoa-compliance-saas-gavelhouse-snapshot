import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../pages/resources/index.astro"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("resources index source", () => {
  it("makes format tabs and topic filters navigable", () => {
    expect(source).toContain('href: "/resources/guides/"');
    expect(source).toContain('href: "/resources/best/"');
    expect(source).toContain('href: "/free/"');
    expect(source).toContain("topicLinks.map");
    expect(source).not.toContain('href="#"');
    expect(source).not.toContain("<button");
  });

  it("links latest rows to concrete resources", () => {
    expect(source).toContain(
      'href: "/resources/guides/fannie-mae-hoa-reserve-requirements/"',
    );
    expect(source).toContain('href: "/free/hoa-annual-meeting-planner/"');
    expect(source).toContain('<a href={href} class="latest-row">');
  });
});
