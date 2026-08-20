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

describe("finance journal route source", () => {
  const source = read("src/routes/_app.finance.journal.tsx");
  const flat = normalize(source);

  it("keys editable journal lines by a stable id, not the array index", () => {
    expect(source).toContain("key={line.id}");
    expect(source).not.toContain("key={index}");
  });

  it("gives every form line a stable generated id", () => {
    expect(flat).toContain("id: crypto.randomUUID()");
    expect(flat).toContain("function blankLine()");
    expect(flat).toContain("[blankLine(), blankLine()]");
  });

  it("formats the posted entry date instead of showing the raw ISO string", () => {
    expect(flat).toContain("{formatDate(entry.entryDate)}");
    expect(source).not.toContain("{entry.entryDate}");
  });
});

describe("governance meetings route source", () => {
  const source = read("src/routes/_app.governance.meetings.tsx");
  const flat = normalize(source);

  it("does not claim minutes are unfinalized when none remain", () => {
    expect(flat).toContain('"All minutes finalized"');
    expect(flat).toContain("meetings.length - finalizedCount > 0");
  });
});
