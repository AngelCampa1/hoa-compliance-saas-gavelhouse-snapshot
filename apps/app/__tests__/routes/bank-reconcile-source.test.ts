import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readReconcileSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/routes/_app.bank.reconcile.tsx"),
    "utf8",
  );
}

describe("bank reconcile route source", () => {
  it("shows an honest empty state when the statement cannot be loaded", () => {
    const source = readReconcileSource();

    // The old fallback rendered a fake in-memory ReconcileGrid stub
    // (id: ""), which masked fetch failures and showed the unsaved-matches
    // warning over an empty grid. The no-data branch must explain the problem.
    expect(source).toContain("We could not open this reconciliation");
    expect(source).not.toContain(
      'reconciliation={{ id: "", status: "open", statementId: "" }}',
    );
  });
});
