import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

/** Collapse runs of whitespace so Prettier line-wrapping can't break assertions. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("_app.billing.tsx polish", () => {
  const source = read("_app.billing.tsx");
  const flat = normalize(source);

  it("routes the communities and billing-status queries through the qk factory", () => {
    expect(source).toContain('import { qk } from "@/lib/query-keys";');
    expect(flat).toContain("queryKey: qk.communities.list()");
    expect(flat).toContain(
      'queryKey: qk.billing.status(firstCommunity?.id ?? "")',
    );
    expect(flat).toContain("qk.billing.status(firstCommunity.id)");
    expect(flat).not.toContain('queryKey: ["communities"]');
    expect(flat).not.toContain('["billing-status", firstCommunity');
  });

  it("drops the unreachable isPendingTrial branch from the plan-card cycle noun", () => {
    // The plan picker block is gated on !isPendingTrial, so the branch was dead.
    expect(flat).toContain(
      'const cycleNoun = isExpired ? "Restore access" : "Switch to this plan"',
    );
    expect(flat).not.toContain("const cycleNoun = isPendingTrial");
  });

  it("uses a consistent unicode ellipsis in the add-payment-method loading label", () => {
    expect(flat).toContain('"Loading…" : "Add payment method"');
    expect(source).not.toContain('"Loading..."');
  });
});
