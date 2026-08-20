import { z } from "zod";

export const TrialBalanceQuery = z.object({
  communityId: z.string(),
  asOf: z.string().date(),
});
export type TrialBalanceQuery = z.infer<typeof TrialBalanceQuery>;

export const BalanceSheetQuery = z.object({
  communityId: z.string(),
  asOf: z.string().date(),
});
export type BalanceSheetQuery = z.infer<typeof BalanceSheetQuery>;

export const TrialBalanceRow = z.object({
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  fundType: z.enum(["operating", "reserve"]),
  debitCents: z.number().int(),
  creditCents: z.number().int(),
});
export type TrialBalanceRow = z.infer<typeof TrialBalanceRow>;

export const ReportPaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ReportPaginationQuery = z.infer<typeof ReportPaginationQuery>;

export const LedgerQuery = z.object({
  communityId: z.string(),
  from: z.string().date(),
  to: z.string().date(),
  accountId: z.string().optional(),
  fundType: z.enum(["operating", "reserve"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LedgerQuery = z.infer<typeof LedgerQuery>;

export const AuditPackQuery = z.object({
  communityId: z.string(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});
export type AuditPackQuery = z.infer<typeof AuditPackQuery>;

export const RoleHandoffQuery = z.object({
  communityId: z.string(),
  transitionId: z.string(),
});
export type RoleHandoffQuery = z.infer<typeof RoleHandoffQuery>;
