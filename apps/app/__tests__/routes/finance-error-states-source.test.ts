import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("finance journal error + key polish", () => {
  const source = read("_app.finance.journal.tsx");
  const flat = normalize(source);

  it("uses the qk factory for the accounts and journal queries", () => {
    expect(source).toContain('import { qk } from "@/lib/query-keys";');
    expect(flat).toContain(
      'queryKey: qk.finance.accounts(firstCommunity?.id ?? "")',
    );
    expect(flat).toContain(
      'queryKey: qk.finance.journal(firstCommunity?.id ?? "")',
    );
    expect(flat).not.toContain('queryKey: ["finance", "journal"');
    expect(flat).not.toContain('queryKey: ["finance", "accounts"');
  });

  it("invalidates the journal list through the qk factory", () => {
    expect(flat).toContain("queryKey: qk.finance.journal(firstCommunity.id)");
  });

  it("shows an error state when the entry log fails to load", () => {
    expect(flat).toContain("isError");
    expect(flat).toContain("We could not load your journal entries.");
  });

  it("does not surface the raw server error message in the post-entry alert", () => {
    expect(flat).toContain(
      "We could not post this entry. Check the amounts and try again.",
    );
    // The raw commingleError must no longer be rendered in the non-commingling branch.
    expect(flat).not.toContain(
      "<AlertDescription>{commingleError}</AlertDescription>",
    );
  });
});

describe("finance reserves error polish", () => {
  const source = read("_app.finance.reserves.tsx");
  const flat = normalize(source);

  it("renders an error branch when the reserve summary fails", () => {
    expect(flat).toContain("isError");
    expect(flat).toContain("We could not load your reserve fund data.");
  });
});

describe("finance dues error polish", () => {
  const source = read("_app.finance.dues.tsx");
  const flat = normalize(source);

  it("handles homeowners and assessments fetch errors", () => {
    expect(flat).toContain("isError: homeownersError");
    expect(flat).toContain("isError: assessmentsError");
    expect(flat).toContain("We could not load your homeowners.");
    expect(flat).toContain("We could not load your assessments.");
  });
});
