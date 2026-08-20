import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readStatementsSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/routes/_app.bank.statements.tsx"),
    "utf8",
  );
}

describe("bank statements route source", () => {
  it("uses plain, non-redundant empty-state copy that matches the form", () => {
    const source = readStatementsSource();

    // The reason no longer just restates the title, and the next step no
    // longer promises a file "upload" the form does not offer (paste only).
    expect(source).toContain(
      "A statement lets you match your books to the bank.",
    );
    expect(source).not.toContain("paste or upload the statement CSV");
  });
});
