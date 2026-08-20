import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("table of contents source regressions", () => {
  it("gives the mobile summary trigger a 44px minimum hit area", () => {
    const source = readSource("./table-of-contents.astro");

    expect(source).toContain(
      '<summary class="flex min-h-11 list-none cursor-pointer items-center justify-between gap-3',
    );
  });
});
