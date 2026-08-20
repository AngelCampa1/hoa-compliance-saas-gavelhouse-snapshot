import { describe, it, expect } from "vitest";
import { auditEvents, auditActionEnum } from "../../src/db/schema/audit.js";

describe("audit schema", () => {
  it("auditEvents table is defined", () => {
    expect(auditEvents).toBeDefined();
  });

  it("auditEvents table has id column", () => {
    expect(auditEvents.id).toBeDefined();
  });

  it("auditEvents table has communityId column", () => {
    expect(auditEvents.communityId).toBeDefined();
  });

  it("auditEvents table has actorUserId column", () => {
    expect(auditEvents.actorUserId).toBeDefined();
  });

  it("auditEvents table has action column", () => {
    expect(auditEvents.action).toBeDefined();
  });

  it("auditEvents table has entityType column", () => {
    expect(auditEvents.entityType).toBeDefined();
  });

  it("auditEvents table has entityId column", () => {
    expect(auditEvents.entityId).toBeDefined();
  });

  it("auditEvents table has diffJson column", () => {
    expect(auditEvents.diffJson).toBeDefined();
  });

  it("auditEvents table has occurredAt column", () => {
    expect(auditEvents.occurredAt).toBeDefined();
  });

  it("auditEvents table does NOT have updatedAt column (append-only)", () => {
    const columns = Object.keys(auditEvents);
    expect(columns).not.toContain("updatedAt");
  });

  it("auditActionEnum is defined", () => {
    expect(auditActionEnum).toBeDefined();
  });

  it("auditActionEnum has all 5 values", () => {
    const values = auditActionEnum.enumValues;
    expect(values).toContain("create");
    expect(values).toContain("update");
    expect(values).toContain("delete");
    expect(values).toContain("post");
    expect(values).toContain("reverse");
    expect(values).toHaveLength(5);
  });
});
