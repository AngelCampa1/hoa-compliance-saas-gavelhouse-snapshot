import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { CancelReasonInput, CANCEL_REASONS } from "../../src/schemas/churn.js";

describe("CANCEL_REASONS", () => {
  it("contains all six expected reasons", () => {
    expect(CANCEL_REASONS).toContain("too_expensive");
    expect(CANCEL_REASONS).toContain("missing_feature");
    expect(CANCEL_REASONS).toContain("switched_to_manager");
    expect(CANCEL_REASONS).toContain("board_dissolved");
    expect(CANCEL_REASONS).toContain("bug_or_reliability");
    expect(CANCEL_REASONS).toContain("other");
    expect(CANCEL_REASONS).toHaveLength(6);
  });
});

describe("CancelReasonInput", () => {
  it("parses a valid input without note", () => {
    const result = CancelReasonInput.parse({
      communityId: "comm-1",
      reason: "too_expensive",
    });
    expect(result.reason).toBe("too_expensive");
    expect(result.note).toBeUndefined();
  });

  it("parses a valid input with an optional note", () => {
    const result = CancelReasonInput.parse({
      communityId: "comm-1",
      reason: "missing_feature",
      note: "We need budget tracking",
    });
    expect(result.note).toBe("We need budget tracking");
  });

  it("accepts all valid reason values", () => {
    for (const reason of CANCEL_REASONS) {
      expect(() =>
        CancelReasonInput.parse({ communityId: "comm-1", reason }),
      ).not.toThrow();
    }
  });

  it("rejects an invalid reason", () => {
    expect(() =>
      CancelReasonInput.parse({
        communityId: "comm-1",
        reason: "not_a_reason",
      }),
    ).toThrow(ZodError);
  });

  it("rejects a note exceeding 500 characters", () => {
    const longNote = "a".repeat(501);
    expect(() =>
      CancelReasonInput.parse({
        communityId: "comm-1",
        reason: "other",
        note: longNote,
      }),
    ).toThrow(ZodError);
  });

  it("accepts a note exactly 500 characters long", () => {
    const maxNote = "a".repeat(500);
    expect(() =>
      CancelReasonInput.parse({
        communityId: "comm-1",
        reason: "other",
        note: maxNote,
      }),
    ).not.toThrow();
  });

  it("rejects missing communityId", () => {
    expect(() => CancelReasonInput.parse({ reason: "too_expensive" })).toThrow(
      ZodError,
    );
  });

  it("rejects missing reason", () => {
    expect(() => CancelReasonInput.parse({ communityId: "comm-1" })).toThrow(
      ZodError,
    );
  });
});
