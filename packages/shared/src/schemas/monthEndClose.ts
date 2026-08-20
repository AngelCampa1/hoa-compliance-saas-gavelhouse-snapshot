import { z } from "zod";

export const StartCloseInput = z.object({
  communityId: z.string(),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});
export type StartCloseInput = z.infer<typeof StartCloseInput>;

export const CLOSE_STEPS = [
  "reconcile_bank",
  "review_tb",
  "post_adjustments",
  "finalize_minutes",
  "generate_pack",
] as const;
export type CloseStep = (typeof CLOSE_STEPS)[number];

export const AdvanceChecklistInput = z.object({
  communityId: z.string(),
  closeId: z.string(),
  step: z.enum(CLOSE_STEPS),
  completed: z.boolean(),
});
export type AdvanceChecklistInput = z.infer<typeof AdvanceChecklistInput>;
