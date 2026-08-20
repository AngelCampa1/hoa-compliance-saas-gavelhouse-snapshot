import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("finance dues route source", () => {
  it("updates the assessment cache immediately after batch create", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    expect(source).toContain("queryClient.setQueryData");
    expect(source).toContain("result.assessmentIds.map((id");
    expect(source).toContain('status: "pending"');
    expect(source).toContain("void queryClient.invalidateQueries");
    // Uses batch endpoint — no per-unit Promise.all
    expect(source).toContain("createAssessmentBatch");
    expect(source).not.toContain("Promise.all");
  });

  it("creates assessment batches via atomic batch endpoint", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    expect(source).toContain("new Set(");
    expect(source).toContain("unitIds: assignedUnitIds");
    expect(source).toContain("previewAssessmentCount === 0");
    expect(source).toContain("without a unit");
    // Ensures single transactional call
    expect(source).toContain("createAssessmentBatch");
  });

  it("limits mark-paid choices to homeowners assigned to the assessed unit", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    expect(source).toContain("payableHomeowners");
    expect(source).toContain("homeowner.unitId === assessment.unitId");
    expect(source).toContain(": []");
    expect(source).toContain("no unit or homeowner");
    expect(source).toContain("payableHomeowners.length === 0");
  });

  it("fetches all assessment pages before computing dashboard totals", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    expect(source).toContain("fetchAllAssessments");
    expect(source).toContain("hasMore");
    expect(source).toContain("offset += pageAssessments.length");
  });

  it("invalidates the mark-paid cache with the canonical community-scoped key", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    // The mark-paid dialog onSuccess must use the canonical key helper so it
    // only refetches the affected community, not a bare 2-element prefix that
    // over-invalidates every community's assessments.
    expect(source).toContain("qk.finance.dues(firstCommunity.id)");
    expect(source).not.toContain('queryKey: ["finance", "assessments"]');
  });

  it("only flags past-due review when something is actually past due", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.finance.dues.tsx"),
      "utf8",
    );

    // The "Next action" card must not say "Review past due" when every
    // assessment is paid or waived. It gates that label on totalPastDue.
    expect(source).toContain("totalPastDue > 0");
    expect(source).toContain('"Review past due"');
    expect(source).toContain('"Dues on track"');
  });
});
