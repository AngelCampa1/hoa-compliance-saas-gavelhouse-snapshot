import { describe, it, expect } from "vitest";
import {
  CLOSE_STEP_LABELS,
  getCloseStepLabel,
  ASSESSMENT_STATUS_LABELS,
  getAssessmentStatusLabel,
} from "@/lib/finance-labels";

describe("CLOSE_STEP_LABELS", () => {
  it("maps reconcile_bank to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["reconcile_bank"]).toBe(
      "Reconcile bank statements",
    );
  });

  it("maps review_journal to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["review_journal"]).toBe("Review journal entries");
  });

  it("maps run_trial_balance to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["run_trial_balance"]).toBe("Run trial balance");
  });

  it("maps approve_close to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["approve_close"]).toBe("Approve period close");
  });

  // keys used in existing tests / real step names
  it("maps bank_rec to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["bank_rec"]).toBe("Reconcile bank statements");
  });

  it("maps sign_off to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["sign_off"]).toBe("Approve period close");
  });

  it("maps fund_transfer to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["fund_transfer"]).toBe("Transfer funds");
  });

  it("maps archive_docs to human-readable label", () => {
    expect(CLOSE_STEP_LABELS["archive_docs"]).toBe("Archive documents");
  });
});

describe("getCloseStepLabel", () => {
  it("returns mapped label for known step", () => {
    expect(getCloseStepLabel("reconcile_bank")).toBe(
      "Reconcile bank statements",
    );
  });

  it("falls back to title-cased step key for unknown steps", () => {
    expect(getCloseStepLabel("some_unknown_step")).toBe("Some Unknown Step");
  });

  it("handles single-word step gracefully", () => {
    expect(getCloseStepLabel("check")).toBe("Check");
  });
});

describe("ASSESSMENT_STATUS_LABELS", () => {
  it("has label for paid", () => {
    expect(ASSESSMENT_STATUS_LABELS["paid"]).toBe("Paid");
  });

  it("has label for pending", () => {
    expect(ASSESSMENT_STATUS_LABELS["pending"]).toBe("Pending");
  });

  it("has label for past_due", () => {
    expect(ASSESSMENT_STATUS_LABELS["past_due"]).toBe("Past Due");
  });

  it("has label for waived", () => {
    expect(ASSESSMENT_STATUS_LABELS["waived"]).toBe("Waived");
  });
});

describe("getAssessmentStatusLabel", () => {
  it("returns human label for known status", () => {
    expect(getAssessmentStatusLabel("past_due")).toBe("Past Due");
  });

  it("capitalizes unknown status as fallback", () => {
    expect(getAssessmentStatusLabel("unknown_status")).toBe("Unknown status");
  });
});
