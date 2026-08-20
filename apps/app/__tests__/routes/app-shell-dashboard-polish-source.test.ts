import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("_app.tsx shell polish", () => {
  const source = read("_app.tsx");
  const flat = normalize(source);

  it("uses the qk factory for the communities and billing queries", () => {
    expect(source).toContain('import { qk } from "@/lib/query-keys";');
    expect(flat).toContain("queryKey: qk.communities.list()");
    expect(flat).toContain(
      'queryKey: qk.billing.status(currentCommunity?.id ?? "")',
    );
    expect(flat).not.toContain('queryKey: ["communities"]');
    expect(flat).not.toContain('queryKey: ["billing-status"');
  });

  it("labels the gated nav tier badge for assistive tech", () => {
    expect(flat).toContain(
      "aria-label={`Requires ${FEATURE_MINIMUM_TIER[feature]} plan`}",
    );
  });

  it("wraps the desktop logo in a home link", () => {
    expect(flat).toContain('aria-label="Gavelhouse home"');
  });

  it("hides the decorative mobile nav toggle icon", () => {
    expect(flat).toContain('<Menu className="h-5 w-5" aria-hidden="true" />');
  });
});

describe("_app.dashboard.tsx polish", () => {
  const source = read("_app.dashboard.tsx");
  const flat = normalize(source);

  it("uses the qk factory for the communities query", () => {
    expect(flat).toContain("queryKey: qk.communities.list()");
    expect(flat).not.toContain('queryKey: ["communities"]');
  });

  it("uses a stable key for the activation skeleton rows", () => {
    expect(flat).toContain("ACTIVATION_CHECKLIST.map(({ step }) =>");
    expect(flat).toContain("key={`skeleton-${step}`}");
  });

  it("hides decorative checklist and empty-state icons", () => {
    expect(flat).toContain(
      '<Building2 className="h-12 w-12 text-muted-foreground" aria-hidden="true" />',
    );
    // Both the complete and incomplete checklist markers are decorative.
    expect(source).not.toMatch(
      /<CheckCircle2\s+className="mt-0\.5 h-4 w-4 shrink-0 text-emerald-500"\s*\/>/,
    );
    expect(source).not.toMatch(
      /<Circle\s+className="mt-0\.5 h-4 w-4 shrink-0 text-muted-foreground"\s*\/>/,
    );
  });

  it("hides the support widget decorative icons", () => {
    expect(flat).toContain(
      '<LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />',
    );
    expect(flat).toContain('<Send className="h-4 w-4" aria-hidden="true" />');
  });

  it("handles activation fetch errors instead of rendering a false-empty checklist", () => {
    expect(flat).toContain("isError: activationError");
    // The at-a-glance numbers must not assert "0 of N complete" on error.
    expect(flat).toContain(
      'activationError ? "Setup status is unavailable right now."',
    );
    // Both action surfaces get an explicit, reachable error branch.
    expect(flat).toContain(
      "We could not load your next step. Refresh the page to try again.",
    );
    expect(flat).toContain("We could not load your setup checklist.");
  });
});
