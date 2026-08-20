import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const globalsPath = path.resolve(__dirname, "globals.css");

function extractBtnGhostBlock(css: string): string {
  const start = css.indexOf(".btn-ghost {");
  if (start === -1)
    throw new Error(".btn-ghost { block not found in globals.css");
  const end = css.indexOf("}", start);
  if (end === -1) throw new Error(".btn-ghost { block has no closing brace");
  return css.slice(start, end + 1);
}

describe("btn-ghost pill canon (G2)", () => {
  it("uses 9999px border-radius (pill) inside .btn-ghost { }", () => {
    const css = fs.readFileSync(globalsPath, "utf8");
    const block = extractBtnGhostBlock(css);
    expect(block).toContain("border-radius: 9999px");
  });

  it("does NOT use var(--radius-sm) inside .btn-ghost { }", () => {
    const css = fs.readFileSync(globalsPath, "utf8");
    const block = extractBtnGhostBlock(css);
    expect(block).not.toContain("var(--radius-sm)");
  });
});
