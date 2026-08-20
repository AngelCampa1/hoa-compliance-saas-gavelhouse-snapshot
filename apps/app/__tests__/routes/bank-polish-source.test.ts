import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-assertion tests for the bank polish pass (statements / reconcile).
 * These route files are excluded from the coverage gate, so the fixes are
 * locked in by asserting on source text. normalize() collapses whitespace so
 * Prettier re-wrapping cannot break a match.
 */
function readRoute(file: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", file), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("bank statements polish", () => {
  const file = "_app.bank.statements.tsx";

  it("uses the centralized query keys instead of inline arrays", () => {
    const source = readRoute(file);
    expect(source).toContain("qk.bank.statements(communityId)");
    expect(source).toContain("qk.finance.accounts(communityId)");
    expect(source).not.toContain('["bank-statements", communityId]');
    expect(source).not.toContain('["finance-accounts", communityId]');
  });

  it("uses the unicode ellipsis in the importing label", () => {
    const source = readRoute(file);
    expect(source).toContain('"Importing…"');
    expect(source).not.toContain('"Importing..."');
  });

  it("formats the statement date instead of showing a raw ISO string", () => {
    const source = readRoute(file);
    expect(source).toContain("function formatStatementDate(isoDate: string)");
    expect(source).toContain("formatStatementDate(stmt.statementDate)");
  });

  it("guards the account picker while accounts load", () => {
    const source = readRoute(file);
    expect(source).toContain("isLoading: accountsLoading");
    expect(source).toContain("accountsLoading ?");
  });

  it("announces a statement load error to assistive tech", () => {
    const source = readRoute(file);
    const norm = normalize(source);
    expect(source).toContain("isError");
    expect(norm).toContain('<div role="alert">');
    expect(norm).toContain("We could not load your statements");
  });
});

describe("bank reconcile polish", () => {
  const file = "_app.bank.reconcile.tsx";

  it("uses the centralized reconciliation key", () => {
    const source = readRoute(file);
    expect(source).toContain(
      "qk.bank.reconciliation(reconciliationId, communityId)",
    );
    expect(source).not.toContain(
      '["reconciliation", reconciliationId, communityId]',
    );
  });

  it("distinguishes a load error from a missing reconciliation", () => {
    const source = readRoute(file);
    const norm = normalize(source);
    expect(source).toContain("isError");
    expect(norm).toContain('<div role="alert">');
    expect(norm).toContain("We could not load this reconciliation");
  });
});
