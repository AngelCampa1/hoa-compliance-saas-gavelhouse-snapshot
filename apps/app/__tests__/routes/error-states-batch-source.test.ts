import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("month-end close error polish", () => {
  const source = read("_app.close.tsx");
  const flat = normalize(source);

  it("guards the close list and checklist against fetch errors", () => {
    expect(flat).toContain("isError: closesError");
    expect(flat).toContain("isError: checklistError");
    expect(flat).toContain("We could not load your month-end closes.");
    expect(flat).toContain("We could not load this checklist.");
  });

  it("uses an ellipsis instead of three dots in the start label", () => {
    expect(flat).toContain("Starting…");
    expect(flat).not.toContain("Starting...");
  });
});

describe("governance homeowners error polish", () => {
  const source = read("_app.governance.homeowners.tsx");
  const flat = normalize(source);

  it("renders an error state instead of a false empty state on fetch failure", () => {
    expect(flat).toContain("isError");
    expect(flat).toContain("We could not load your homeowners.");
  });

  it("uses ellipsis characters in the placeholder and pending labels", () => {
    expect(flat).toContain("Search by last name…");
    expect(flat).toContain("Generating…");
    expect(flat).toContain("Sending…");
    expect(flat).not.toContain("Search by last name...");
  });
});

describe("portfolio index error polish", () => {
  const source = read("_app.portfolio.index.tsx");
  const flat = normalize(source);

  it("handles portfolio, communities, and rollup fetch errors", () => {
    expect(flat).toContain("isError: portfoliosError");
    expect(flat).toContain("isError: communitiesError");
    expect(flat).toContain("isError: rollupError");
    expect(flat).toContain("We could not load your portfolios.");
    expect(flat).toContain("We could not load your communities.");
    expect(flat).toContain("We could not load this portfolio");
  });

  it("hides the decorative plus icons from assistive tech", () => {
    expect(flat).toContain(
      '<Plus className="mr-2 h-4 w-4" aria-hidden="true" />',
    );
  });
});

describe("billing error polish", () => {
  const source = read("_app.billing.tsx");
  const flat = normalize(source);

  it("surfaces billing and usage fetch errors", () => {
    expect(flat).toContain("isError: usageError");
    expect(flat).toContain("We could not load your billing details.");
    expect(flat).toContain("We could not load your usage.");
  });
});

describe("settings error polish", () => {
  const source = read("_app.settings.tsx");
  const flat = normalize(source);

  it("shows an error state when community settings fail to load", () => {
    expect(flat).toContain("isError");
    expect(flat).toContain("We could not load your community settings.");
  });
});
