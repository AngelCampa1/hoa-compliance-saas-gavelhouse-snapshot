import { describe, it, expect } from "vitest";
import {
  createViolationInput,
  updateViolationStatusInput,
  createArchRequestInput,
  reviewArchRequestInput,
  createMeetingInput,
  updateMeetingMinutesInput,
  createMotionInput,
  resolveMotionInput,
  castVoteInput,
  createOwnerPortalSessionInput,
  rosterRowSchema,
  homeownerImportSkipReasonSchema,
  homeownerImportSkippedRowSchema,
  homeownerImportResponseSchema,
} from "../../src/schemas/governance.js";

describe("createViolationInput", () => {
  it("requires communityId, title, description", () => {
    expect(
      createViolationInput.safeParse({
        communityId: "c1",
        title: "Trash",
        description: "Bins left out",
      }).success,
    ).toBe(true);
    expect(createViolationInput.safeParse({ communityId: "c1" }).success).toBe(
      false,
    );
  });
  it("allows optional unitId and homeownerId", () => {
    expect(
      createViolationInput.safeParse({
        communityId: "c1",
        title: "T",
        description: "D",
        unitId: "u1",
        homeownerId: "h1",
      }).success,
    ).toBe(true);
  });
});

describe("updateViolationStatusInput", () => {
  it("accepts valid statuses", () => {
    expect(
      updateViolationStatusInput.safeParse({ status: "notified" }).success,
    ).toBe(true);
    expect(
      updateViolationStatusInput.safeParse({ status: "cured" }).success,
    ).toBe(true);
    expect(
      updateViolationStatusInput.safeParse({ status: "closed" }).success,
    ).toBe(true);
    expect(
      updateViolationStatusInput.safeParse({ status: "open" }).success,
    ).toBe(true);
  });
  it("rejects invalid status", () => {
    expect(
      updateViolationStatusInput.safeParse({ status: "expired" }).success,
    ).toBe(false);
  });
  it("allows optional note", () => {
    expect(
      updateViolationStatusInput.safeParse({ status: "cured", note: "Fixed" })
        .success,
    ).toBe(true);
  });
});

describe("createArchRequestInput", () => {
  it("requires communityId, requestType, description", () => {
    expect(
      createArchRequestInput.safeParse({
        communityId: "c1",
        requestType: "Fence",
        description: "6ft wood fence",
      }).success,
    ).toBe(true);
    expect(
      createArchRequestInput.safeParse({
        communityId: "c1",
        requestType: "Fence",
      }).success,
    ).toBe(false);
  });
});

describe("reviewArchRequestInput", () => {
  it("accepts approved/denied/approved_with_conditions", () => {
    expect(
      reviewArchRequestInput.safeParse({ status: "approved" }).success,
    ).toBe(true);
    expect(
      reviewArchRequestInput.safeParse({
        status: "approved_with_conditions",
        reviewNote: "ok",
      }).success,
    ).toBe(true);
    expect(reviewArchRequestInput.safeParse({ status: "denied" }).success).toBe(
      true,
    );
    expect(
      reviewArchRequestInput.safeParse({ status: "pending" }).success,
    ).toBe(false);
  });
});

describe("createMeetingInput", () => {
  it("requires communityId, title, meetingType, scheduledAt", () => {
    expect(
      createMeetingInput.safeParse({
        communityId: "c1",
        title: "Annual",
        meetingType: "annual",
        scheduledAt: "2026-06-01T18:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      createMeetingInput.safeParse({
        communityId: "c1",
        title: "Annual",
        meetingType: "invalid",
        scheduledAt: "2026-06-01T18:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("updateMeetingMinutesInput", () => {
  it("requires minutesText", () => {
    expect(
      updateMeetingMinutesInput.safeParse({
        minutesText: "Meeting called to order...",
      }).success,
    ).toBe(true);
    expect(updateMeetingMinutesInput.safeParse({}).success).toBe(false);
  });
  it("finalize defaults to false", () => {
    const r = updateMeetingMinutesInput.safeParse({ minutesText: "text" });
    expect(r.success && r.data.finalize).toBe(false);
  });
});

describe("createMotionInput", () => {
  it("requires text", () => {
    expect(
      createMotionInput.safeParse({ text: "Approve budget" }).success,
    ).toBe(true);
    expect(createMotionInput.safeParse({}).success).toBe(false);
  });
});

describe("resolveMotionInput", () => {
  it("accepts passed/failed/tabled", () => {
    expect(resolveMotionInput.safeParse({ status: "passed" }).success).toBe(
      true,
    );
    expect(resolveMotionInput.safeParse({ status: "pending" }).success).toBe(
      false,
    );
  });
});

describe("castVoteInput", () => {
  it("accepts yes/no/abstain", () => {
    expect(castVoteInput.safeParse({ choice: "yes" }).success).toBe(true);
    expect(castVoteInput.safeParse({ choice: "no" }).success).toBe(true);
    expect(castVoteInput.safeParse({ choice: "abstain" }).success).toBe(true);
    expect(castVoteInput.safeParse({ choice: "maybe" }).success).toBe(false);
  });
});

describe("createOwnerPortalSessionInput", () => {
  it("requires homeownerId and communityId", () => {
    expect(
      createOwnerPortalSessionInput.safeParse({
        homeownerId: "h1",
        communityId: "c1",
      }).success,
    ).toBe(true);
    expect(
      createOwnerPortalSessionInput.safeParse({ homeownerId: "h1" }).success,
    ).toBe(false);
  });

  it("defaults sendEmail to false and accepts explicit email delivery", () => {
    expect(
      createOwnerPortalSessionInput.parse({
        homeownerId: "h1",
        communityId: "c1",
      }),
    ).toEqual({
      homeownerId: "h1",
      communityId: "c1",
      sendEmail: false,
    });
    expect(
      createOwnerPortalSessionInput.parse({
        homeownerId: "h1",
        communityId: "c1",
        sendEmail: true,
      }).sendEmail,
    ).toBe(true);
  });
});

describe("rosterRowSchema", () => {
  it("requires firstName, lastName, email, address", () => {
    expect(
      rosterRowSchema.safeParse({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        address: "123 Main St",
      }).success,
    ).toBe(true);
    expect(
      rosterRowSchema.safeParse({
        firstName: "Jane",
        lastName: "Smith",
        email: "not-email",
        address: "123 Main St",
      }).success,
    ).toBe(false);
    expect(
      rosterRowSchema.safeParse({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
      }).success,
    ).toBe(false);
  });
  it("allows optional phone, unitNumber, moveInDate", () => {
    expect(
      rosterRowSchema.safeParse({
        firstName: "J",
        lastName: "S",
        email: "j@e.com",
        address: "1 Main",
        phone: "555-1234",
        unitNumber: "4B",
        moveInDate: "2023-01-01",
      }).success,
    ).toBe(true);
  });
});

describe("homeownerImportSkipReasonSchema", () => {
  it("accepts the three valid reasons", () => {
    expect(
      homeownerImportSkipReasonSchema.safeParse("duplicate-in-upload").success,
    ).toBe(true);
    expect(
      homeownerImportSkipReasonSchema.safeParse("already-exists").success,
    ).toBe(true);
    expect(
      homeownerImportSkipReasonSchema.safeParse("invalid").success,
    ).toBe(true);
  });
  it("rejects unknown reasons", () => {
    expect(
      homeownerImportSkipReasonSchema.safeParse("other").success,
    ).toBe(false);
    expect(
      homeownerImportSkipReasonSchema.safeParse("").success,
    ).toBe(false);
  });
});

describe("homeownerImportSkippedRowSchema", () => {
  it("accepts a valid skipped row", () => {
    expect(
      homeownerImportSkippedRowSchema.safeParse({
        row: 2,
        email: "jane@example.com",
        reason: "already-exists",
      }).success,
    ).toBe(true);
  });
  it("allows empty string email (for invalid parse errors)", () => {
    expect(
      homeownerImportSkippedRowSchema.safeParse({
        row: 2,
        email: "",
        reason: "invalid",
      }).success,
    ).toBe(true);
  });
  it("rejects missing row", () => {
    expect(
      homeownerImportSkippedRowSchema.safeParse({
        email: "jane@example.com",
        reason: "already-exists",
      }).success,
    ).toBe(false);
  });
  it("rejects invalid reason", () => {
    expect(
      homeownerImportSkippedRowSchema.safeParse({
        row: 2,
        email: "jane@example.com",
        reason: "bad-reason",
      }).success,
    ).toBe(false);
  });
});

describe("homeownerImportResponseSchema", () => {
  it("accepts a valid response with created and skipped", () => {
    expect(
      homeownerImportResponseSchema.safeParse({
        created: 5,
        skipped: [
          { row: 3, email: "dup@example.com", reason: "duplicate-in-upload" },
        ],
      }).success,
    ).toBe(true);
  });
  it("accepts an empty skipped array", () => {
    expect(
      homeownerImportResponseSchema.safeParse({
        created: 10,
        skipped: [],
      }).success,
    ).toBe(true);
  });
  it("rejects negative created", () => {
    expect(
      homeownerImportResponseSchema.safeParse({
        created: -1,
        skipped: [],
      }).success,
    ).toBe(false);
  });
  it("rejects missing skipped field", () => {
    expect(
      homeownerImportResponseSchema.safeParse({ created: 3 }).success,
    ).toBe(false);
  });
  it("rejects missing created field", () => {
    expect(
      homeownerImportResponseSchema.safeParse({ skipped: [] }).success,
    ).toBe(false);
  });
});
