import { z } from "zod";

export const accountTypeEnum = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);
export type AccountType = z.infer<typeof accountTypeEnum>;

export const fundTypeEnum = z.enum(["operating", "reserve"]);
export type FundType = z.infer<typeof fundTypeEnum>;

export const createAccountInput = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(256),
  accountType: accountTypeEnum,
  fundType: fundTypeEnum,
  parentAccountId: z.string().nullable().optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const updateAccountInput = createAccountInput.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountInput>;
