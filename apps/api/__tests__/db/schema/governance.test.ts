import { describe, it, expect } from "vitest";
import {
  violations,
  violationEvents,
  violationStatusEnum,
  archRequests,
  archRequestStatusEnum,
  meetings,
  meetingTypeEnum,
  motions,
  motionStatusEnum,
  votes,
  voteChoiceEnum,
  ownerPortalSessions,
  boardTransitions,
  boardTransitionStatusEnum,
} from "../../../src/db/schema/governance.js";

describe("governance schema exports", () => {
  it("exports violations table with required columns", () => {
    expect(violations).toBeDefined();
    expect(violations.communityId).toBeDefined();
    expect(violations.status).toBeDefined();
    expect(violations.photoKeys).toBeDefined();
  });
  it("exports violationEvents", () => {
    expect(violationEvents).toBeDefined();
    expect(violationEvents.toStatus).toBeDefined();
  });
  it("exports archRequests", () => {
    expect(archRequests).toBeDefined();
    expect(archRequests.status).toBeDefined();
    expect(archRequests.attachmentKeys).toBeDefined();
  });
  it("exports meetings table", () => {
    expect(meetings).toBeDefined();
    expect(meetings.meetingType).toBeDefined();
    expect(meetings.minutesText).toBeDefined();
  });
  it("exports motions", () => {
    expect(motions).toBeDefined();
    expect(motions.status).toBeDefined();
  });
  it("exports votes with unique index on (motionId, voterUserId)", () => {
    expect(votes).toBeDefined();
    expect(votes.choice).toBeDefined();
  });
  it("exports ownerPortalSessions with token", () => {
    expect(ownerPortalSessions).toBeDefined();
    expect(ownerPortalSessions.token).toBeDefined();
    expect(ownerPortalSessions.expiresAt).toBeDefined();
  });
  it("exports boardTransitions", () => {
    expect(boardTransitions).toBeDefined();
    expect(boardTransitions.role).toBeDefined();
    expect(boardTransitions.pendingItems).toBeDefined();
  });
  it("exports all enums", () => {
    expect(violationStatusEnum).toBeDefined();
    expect(archRequestStatusEnum).toBeDefined();
    expect(meetingTypeEnum).toBeDefined();
    expect(motionStatusEnum).toBeDefined();
    expect(voteChoiceEnum).toBeDefined();
    expect(boardTransitionStatusEnum).toBeDefined();
  });
});
