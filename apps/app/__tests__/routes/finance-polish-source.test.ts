import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-assertion tests for the finance polish pass (accounts / dues /
 * reserves). These route files are excluded from the coverage gate, so the
 * fixes are locked in by asserting on source text. normalize() collapses
 * whitespace so Prettier re-wrapping cannot break a match.
 */
function read(file: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", file), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("finance accounts polish", () => {
  const file = "_app.finance.accounts.tsx";

  it("announces the update error to assistive tech", () => {
    const source = normalize(read(file));
    expect(source).toContain('text-destructive" role="alert"');
  });

  it("labels each row Edit button with the account name", () => {
    const source = normalize(read(file));
    expect(source).toContain("aria-label={`Edit ${account.name}`}");
  });

  it("handles the query error state instead of a misleading empty list", () => {
    const source = read(file);
    const norm = normalize(source);
    expect(source).toContain("isError,");
    expect(norm).toContain(
      "We could not load your accounts. Refresh the page to try again.",
    );
  });
});

describe("finance dues polish", () => {
  const file = "_app.finance.dues.tsx";

  it("uses the centralized communities key", () => {
    const source = read(file);
    expect(source).toContain("queryKey: qk.communities.list()");
    expect(source).not.toContain('["communities"]');
  });

  it("formats money with a locale currency formatter", () => {
    const source = read(file);
    expect(source).toContain("function formatCurrency(cents: number)");
    expect(source).toContain("formatCurrency(assessment.amountCents)");
    expect(source).toContain("formatCurrency(totalOutstanding)");
    expect(source).toContain("formatCurrency(a.amountCents)");
    // No raw cents-to-dollars string concatenation should remain.
    expect(source).not.toContain("(a.amountCents / 100).toFixed(2)");
    expect(source).not.toContain("(totalOutstanding / 100).toFixed(2)");
  });

  it("formats the due date instead of showing a raw ISO string", () => {
    const source = read(file);
    expect(source).toContain("function formatDueDate(isoDate: string)");
    expect(source).toContain("formatDueDate(a.dueDate)");
  });

  it("announces mutation errors to assistive tech", () => {
    const source = normalize(read(file));
    expect(source).toContain('text-destructive" role="alert"');
  });

  it("labels each row Mark paid button with the period", () => {
    const source = normalize(read(file));
    expect(source).toContain("aria-label={`Mark ${a.period} assessment paid`}");
  });
});

describe("finance reserves polish", () => {
  const file = "_app.finance.reserves.tsx";

  it("uses the unicode ellipsis in the saving label", () => {
    const source = read(file);
    expect(source).toContain('"Saving…"');
    expect(source).not.toContain('"Saving..."');
  });

  it("labels the component filter input", () => {
    const source = read(file);
    expect(source).toContain('aria-label="Filter reserve components"');
  });

  it("hides the decorative import icon from assistive tech", () => {
    const source = normalize(read(file));
    expect(source).toContain(
      '<FileUp className="mr-2 h-4 w-4" aria-hidden="true" />',
    );
  });
});
