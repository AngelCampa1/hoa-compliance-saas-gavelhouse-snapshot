import { z } from "zod";
import { INT32_MAX, INT32_MIN } from "../constants/system.js";

export const StatementImportInput = z.object({
  communityId: z.string().min(1),
  accountId: z.string().min(1),
  beginningBalanceCents: z.number().int().min(INT32_MIN).max(INT32_MAX),
  endingBalanceCents: z.number().int().min(INT32_MIN).max(INT32_MAX),
  statementDate: z.string().date(),
  csv: z.string().min(1),
});
export type StatementImportInput = z.infer<typeof StatementImportInput>;

export const MatchInput = z
  .object({
    communityId: z.string().min(1),
    reconciliationId: z.string().min(1),
    statementLineId: z.string().min(1),
    paymentId: z.string().min(1).nullable(),
    journalLineId: z.string().min(1).nullable(),
  })
  .refine((v) => v.paymentId !== null || v.journalLineId !== null, {
    message: "must link paymentId or journalLineId",
  });
export type MatchInput = z.infer<typeof MatchInput>;

export const FinalizeReconciliationInput = z.object({
  communityId: z.string().min(1),
  reconciliationId: z.string().min(1),
});
export type FinalizeReconciliationInput = z.infer<
  typeof FinalizeReconciliationInput
>;
