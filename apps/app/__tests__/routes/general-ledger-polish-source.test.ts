import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

/** Collapse runs of whitespace so Prettier line-wrapping can't break assertions. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("reports general-ledger route source", () => {
  const source = read("src/routes/_app.reports.general-ledger.tsx");
  const flat = normalize(source);

  it("formats the entry date instead of rendering the raw ISO string", () => {
    expect(flat).toContain("function formatDate(iso: string)");
    expect(flat).toContain("render: (row) => formatDate(row.entryDate)");
    expect(source).not.toContain("render: (row) => row.entryDate");
  });

  it("capitalizes the fund label for visual consistency", () => {
    expect(flat).toContain(
      '<span className="capitalize">{row.fundType}</span>',
    );
    expect(source).not.toContain("render: (row) => row.fundType");
  });
});
