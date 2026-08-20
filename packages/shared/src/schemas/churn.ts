import { z } from "zod";

export const CANCEL_REASONS = [
  "too_expensive",
  "missing_feature",
  "switched_to_manager",
  "board_dissolved",
  "bug_or_reliability",
  "other",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CancelReasonInput = z.object({
  communityId: z.string(),
  reason: z.enum(CANCEL_REASONS),
  note: z.string().max(500).optional(),
});
export type CancelReasonInput = z.infer<typeof CancelReasonInput>;
