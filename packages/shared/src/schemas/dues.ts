import { z } from "zod";
import { yearMonthString, calendarDateString } from "./dateValidity.js";
import { INT32_MAX } from "../constants/system.js";

export const createUnitInput = z.object({
  communityId: z.string().min(1),
  address: z.string().min(1).max(256),
  unitNumber: z.string().optional(),
  sqft: z.number().int().min(0).max(INT32_MAX).optional(),
});
export type CreateUnitInput = z.infer<typeof createUnitInput>;

export const createHomeownerInput = z.object({
  communityId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  moveInDate: calendarDateString.optional(),
});
export type CreateHomeownerInput = z.infer<typeof createHomeownerInput>;

export const createAssessmentInput = z.object({
  communityId: z.string().min(1),
  unitId: z.string().min(1),
  period: yearMonthString,
  amountCents: z.number().int().min(1).max(INT32_MAX),
  fundType: z.enum(["operating", "reserve"]),
  dueDate: calendarDateString,
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInput>;

export const createAssessmentBatchInput = z.object({
  communityId: z.string().min(1),
  unitIds: z.array(z.string().min(1)).min(1),
  period: yearMonthString,
  amountCents: z.number().int().min(1).max(INT32_MAX),
  fundType: z.enum(["operating", "reserve"]),
  dueDate: calendarDateString,
});
export type CreateAssessmentBatchInput = z.infer<
  typeof createAssessmentBatchInput
>;

export const payDuesInput = z.object({
  communityId: z.string().min(1),
  assessmentId: z.string().min(1),
  homeownerId: z.string().min(1),
  amountCents: z.number().int().min(1).max(INT32_MAX),
  method: z.enum(["ach", "card", "check", "other"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type PayDuesInput = z.infer<typeof payDuesInput>;
