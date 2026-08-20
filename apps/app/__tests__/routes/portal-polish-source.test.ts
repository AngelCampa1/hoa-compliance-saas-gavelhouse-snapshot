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

describe("portal.tsx homeowner polish", () => {
  const source = read("portal.tsx");
  const flat = normalize(source);

  it("humanizes raw snake_case status codes for homeowners", () => {
    expect(flat).toContain("function formatStatusLabel(status: string)");
    expect(flat).toContain(
      "render: (assessment) => formatStatusLabel(assessment.status)",
    );
    expect(flat).toContain("Status: {formatStatusLabel(request.status)}");
    // The raw machine values must no longer be rendered verbatim.
    expect(flat).not.toContain("render: (assessment) => assessment.status");
    expect(flat).not.toContain("Status: {request.status}");
  });

  it("formats the assessment amount and due date through shared helpers", () => {
    expect(flat).toContain('from "@/lib/money"');
    expect(flat).toContain("formatCents");
    expect(flat).toContain("function formatDate(iso: string)");
    expect(flat).toContain(
      "render: (assessment) => formatCents(assessment.amountCents)",
    );
    expect(flat).toContain(
      'assessment.dueDate ? formatDate(assessment.dueDate) : "-"',
    );
    expect(flat).not.toContain('assessment.dueDate ?? "-"');
    expect(flat).not.toContain(
      "`$${(assessment.amountCents / 100).toFixed(2)}`",
    );
  });

  it("resets the checkout banner before starting a new payment", () => {
    expect(flat).toContain(
      "paymentMutation.reset(); paymentMutation.mutate(assessment)",
    );
  });

  it("formats architectural-request dates through the same helper as due dates", () => {
    expect(flat).toContain("{formatDate(request.createdAt)}");
    // No second, locale-ambiguous date format on the same page.
    expect(flat).not.toContain(
      "new Date(request.createdAt).toLocaleDateString()",
    );
  });

  it("never surfaces a raw server error to a homeowner", () => {
    expect(flat).toContain(
      "We could not start your payment. Please try again.",
    );
    expect(flat).toContain(
      "We could not submit your request. Please try again.",
    );
    // The payment + arch-request handlers must not render err.message.
    expect(flat).not.toContain(
      'err instanceof Error ? err.message : "Unable to start payment."',
    );
    expect(flat).not.toContain("createArchRequestMutation.error instanceof");
  });

  it("uses a unicode ellipsis in the loading copy", () => {
    expect(flat).toContain("Loading your account…");
    expect(flat).not.toContain("Loading your account...");
  });
});
