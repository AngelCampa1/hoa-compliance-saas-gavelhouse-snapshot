import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-assertion tests for the settings polish pass. The route file is
 * excluded from the coverage gate, so behaviour is locked in by asserting on
 * source text. normalize() collapses whitespace so Prettier re-wrapping cannot
 * break a match.
 */
function read(): string {
  return readFileSync(
    resolve(process.cwd(), "src/routes", "_app.settings.tsx"),
    "utf8",
  );
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("settings polish", () => {
  it("loading labels use the unicode ellipsis, not ASCII dots", () => {
    const source = read();
    expect(source).toContain('"Saving…"');
    expect(source).toContain('"Updating…"');
    expect(source).toContain('"Deleting…"');
    expect(source).toContain('"Inviting…"');
    expect(source).not.toContain("Saving...");
    expect(source).not.toContain("Updating...");
    expect(source).not.toContain("Deleting...");
    expect(source).not.toContain("Inviting...");
  });

  it("uses the centralized qk.communities.list() key for read and invalidation", () => {
    const source = read();
    expect(source).toContain('import { qk } from "@/lib/query-keys"');
    expect(source).toContain("queryKey: qk.communities.list()");
    expect(source).toContain(
      "invalidateQueries({ queryKey: qk.communities.list() })",
    );
    // No inline ["communities"] literal should remain
    expect(source).not.toContain('["communities"]');
  });

  it("renders the delete-account root error inside a destructive Alert", () => {
    const source = normalize(read());
    expect(source).toContain(
      '<Alert variant="destructive"> <AlertDescription> {deleteAccountForm.formState.errors.root.message}',
    );
  });

  it("labels the invitation URL for assistive tech", () => {
    const source = read();
    expect(source).toContain('aria-label="Invitation URL"');
  });
});
