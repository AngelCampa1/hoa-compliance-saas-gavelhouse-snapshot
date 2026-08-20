import { z } from "zod";

export const auditActionEnum = z.enum([
  "create",
  "update",
  "delete",
  "post",
  "reverse",
]);

export const auditEventRecord = z.object({
  id: z.string(),
  communityId: z.string(),
  actorUserId: z.string().nullable(),
  action: auditActionEnum,
  entityType: z.string(),
  entityId: z.string(),
  diffJson: z.unknown().nullable().optional(),
  occurredAt: z.string(),
});
