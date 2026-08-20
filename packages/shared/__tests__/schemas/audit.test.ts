import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { auditActionEnum, auditEventRecord } from "../../src/schemas/audit.js";

describe("auditActionEnum", () => {
  it("accepts 'create'", () => {
    expect(auditActionEnum.parse("create")).toBe("create");
  });

  it("accepts 'update'", () => {
    expect(auditActionEnum.parse("update")).toBe("update");
  });

  it("accepts 'delete'", () => {
    expect(auditActionEnum.parse("delete")).toBe("delete");
  });

  it("accepts 'post'", () => {
    expect(auditActionEnum.parse("post")).toBe("post");
  });

  it("accepts 'reverse'", () => {
    expect(auditActionEnum.parse("reverse")).toBe("reverse");
  });

  it("rejects invalid action", () => {
    expect(() => auditActionEnum.parse("approve")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => auditActionEnum.parse("")).toThrow(ZodError);
  });
});

describe("auditEventRecord", () => {
  const validRecord = {
    id: "evt-1",
    communityId: "comm-1",
    actorUserId: "user-1",
    action: "create" as const,
    entityType: "account",
    entityId: "acc-1",
    diffJson: null,
    occurredAt: "2024-01-01T00:00:00Z",
  };

  it("parses a full valid record", () => {
    const result = auditEventRecord.parse(validRecord);
    expect(result.id).toBe("evt-1");
    expect(result.communityId).toBe("comm-1");
    expect(result.actorUserId).toBe("user-1");
    expect(result.action).toBe("create");
    expect(result.entityType).toBe("account");
    expect(result.entityId).toBe("acc-1");
    expect(result.occurredAt).toBe("2024-01-01T00:00:00Z");
  });

  it("accepts null actorUserId", () => {
    const result = auditEventRecord.parse({
      ...validRecord,
      actorUserId: null,
    });
    expect(result.actorUserId).toBeNull();
  });

  it("accepts missing diffJson (optional)", () => {
    const { diffJson: _df, ...withoutDiff } = validRecord;
    const result = auditEventRecord.parse(withoutDiff);
    expect(result.diffJson).toBeUndefined();
  });

  it("accepts null diffJson", () => {
    const result = auditEventRecord.parse({ ...validRecord, diffJson: null });
    expect(result.diffJson).toBeNull();
  });

  it("accepts object diffJson", () => {
    const result = auditEventRecord.parse({
      ...validRecord,
      diffJson: { before: "a", after: "b" },
    });
    expect(result.diffJson).toEqual({ before: "a", after: "b" });
  });

  it("rejects invalid action value", () => {
    expect(() =>
      auditEventRecord.parse({ ...validRecord, action: "approve" }),
    ).toThrow(ZodError);
  });

  it("rejects missing id", () => {
    const { id: _id, ...withoutId } = validRecord;
    expect(() => auditEventRecord.parse(withoutId)).toThrow(ZodError);
  });

  it("rejects missing communityId", () => {
    const { communityId: _cid, ...withoutCid } = validRecord;
    expect(() => auditEventRecord.parse(withoutCid)).toThrow(ZodError);
  });

  it("rejects missing action", () => {
    const { action: _action, ...withoutAction } = validRecord;
    expect(() => auditEventRecord.parse(withoutAction)).toThrow(ZodError);
  });

  it("rejects missing entityType", () => {
    const { entityType: _et, ...withoutEt } = validRecord;
    expect(() => auditEventRecord.parse(withoutEt)).toThrow(ZodError);
  });

  it("rejects missing entityId", () => {
    const { entityId: _eid, ...withoutEid } = validRecord;
    expect(() => auditEventRecord.parse(withoutEid)).toThrow(ZodError);
  });

  it("rejects missing occurredAt", () => {
    const { occurredAt: _occ, ...withoutOcc } = validRecord;
    expect(() => auditEventRecord.parse(withoutOcc)).toThrow(ZodError);
  });

  it("accepts all 5 valid action values in records", () => {
    const actions = ["create", "update", "delete", "post", "reverse"] as const;
    for (const action of actions) {
      const result = auditEventRecord.parse({ ...validRecord, action });
      expect(result.action).toBe(action);
    }
  });
});
