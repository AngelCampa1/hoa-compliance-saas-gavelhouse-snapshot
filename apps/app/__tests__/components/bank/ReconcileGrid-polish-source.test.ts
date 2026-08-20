import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/components/bank/ReconcileGrid.tsx"),
    "utf8",
  );
}

/** Collapse runs of whitespace so Prettier line-wrapping can't break assertions. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("ReconcileGrid polish", () => {
  const flat = normalize(readSource());

  it("never surfaces a raw server error to the treasurer", () => {
    expect(flat).toContain("We could not remove this match. Please try again.");
    expect(flat).toContain("We could not save this match. Please try again.");
    expect(flat).toContain(
      "We could not finalize this reconciliation. Please try again.",
    );
    // No raw err.message fallbacks remain at any failure site.
    expect(flat).not.toContain("err instanceof Error ? err.message");
    expect(flat).not.toContain('"Failed to persist unmatch."');
    expect(flat).not.toContain('"Failed to persist match."');
    expect(flat).not.toContain('"Finalize failed."');
  });

  it("uses a unicode ellipsis in the finalizing label", () => {
    expect(flat).toContain('"Finalizing…"');
    expect(flat).not.toContain('"Finalizing..."');
  });
});
