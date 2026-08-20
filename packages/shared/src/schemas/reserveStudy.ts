import { z } from "zod";
import { calendarDateString } from "./dateValidity.js";
import { INT32_MAX } from "../constants/system.js";

const baseReserveComponentInput = z.object({
  name: z.string().min(1).max(256),
  usefulLifeYears: z.number().int().min(1).max(INT32_MAX),
  remainingLifeYears: z.number().int().min(0).max(INT32_MAX),
  replacementCostCents: z.number().int().min(0).max(INT32_MAX),
  currentReserveCents: z.number().int().min(0).max(INT32_MAX),
});

export const reserveComponentInput = baseReserveComponentInput.refine(
  (data) => data.remainingLifeYears <= data.usefulLifeYears,
  {
    message: "remainingLifeYears must be <= usefulLifeYears",
    path: ["remainingLifeYears"],
  },
);

export type ReserveComponentInput = z.infer<typeof reserveComponentInput>;

export const upsertReserveStudyInput = z
  .object({
    communityId: z.string().min(1),
    effectiveDate: calendarDateString,
    methodology: z.string().optional(),
    notes: z.string().optional(),
    annualBudgetCents: z.number().int().min(1).max(INT32_MAX).optional(),
    annualReserveContributionCents: z.number().int().min(0).max(INT32_MAX).optional(),
    components: z.array(reserveComponentInput).min(1),
  })
  .superRefine((data, ctx) => {
    const hasBudget = data.annualBudgetCents !== undefined;
    const hasContribution = data.annualReserveContributionCents !== undefined;

    if (hasBudget !== hasContribution) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasBudget
          ? ["annualReserveContributionCents"]
          : ["annualBudgetCents"],
        message:
          "Annual budget and annual reserve contribution must be provided together.",
      });
      return;
    }

    if (
      hasBudget &&
      hasContribution &&
      data.annualReserveContributionCents! > data.annualBudgetCents!
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualReserveContributionCents"],
        message: "Annual reserve contribution cannot exceed the annual budget.",
      });
    }
  });

export type UpsertReserveStudyInput = z.infer<typeof upsertReserveStudyInput>;

export const updateReserveAllocationInput = z
  .object({
    communityId: z.string().min(1),
    annualBudgetCents: z.number().int().min(1).max(INT32_MAX),
    annualReserveContributionCents: z.number().int().min(0).max(INT32_MAX),
  })
  .superRefine((data, ctx) => {
    if (data.annualReserveContributionCents > data.annualBudgetCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualReserveContributionCents"],
        message: "Annual reserve contribution cannot exceed the annual budget.",
      });
    }
  });

export type UpdateReserveAllocationInput = z.infer<
  typeof updateReserveAllocationInput
>;

const componentWithId = baseReserveComponentInput
  .extend({ id: z.string() })
  .refine(
    (data) => data.remainingLifeYears <= data.usefulLifeYears,
    {
      message: "remainingLifeYears must be <= usefulLifeYears",
      path: ["remainingLifeYears"],
    },
  );

export const reserveSummaryResponse = z
  .object({
    studyId: z.string().nullable(),
    effectiveDate: z.string().nullable(),
    components: z.array(componentWithId),
    totalReserveBalance: z.number(),
    totalProjectedNeed: z.number(),
    percentFunded: z.number().nullable(),
    annualBudgetCents: z.number().nullable(),
    annualReserveContributionCents: z.number().nullable(),
    allocationPercent: z.number().nullable(),
    fannieMaeCompliant: z.boolean().nullable(),
    fannieMaeComplianceBasis: z
      .enum([
        "annual_budget_allocation",
        "annual_budget_allocation_unavailable",
      ])
      .nullable(),
    stateRequirements: z
      .object({
        stateCode: z.string(),
        stateName: z.string(),
        reserveStudyRequired: z.boolean(),
        minimumFundingPercent: z.number().nullable(),
        statuteCitation: z.string().nullable(),
      })
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.fannieMaeCompliant !== null &&
      data.fannieMaeComplianceBasis !== "annual_budget_allocation"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fannieMaeComplianceBasis"],
        message:
          "Fannie Mae compliance requires an annual budget allocation basis.",
      });
    }
  });

export type ReserveSummaryResponse = z.infer<typeof reserveSummaryResponse>;
