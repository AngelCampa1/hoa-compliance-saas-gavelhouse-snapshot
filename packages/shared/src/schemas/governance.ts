import { z } from "zod";
import { calendarDateString } from "./dateValidity.js";

export const createViolationInput = z
  .object({
    communityId: z.string().min(1),
    unitId: z.string().optional(),
    homeownerId: z.string().optional(),
    title: z.string().min(1).max(200),
    description: z.string().min(1),
  })
  .strict();

export const updateViolationStatusInput = z.object({
  status: z.enum(["open", "notified", "cured", "closed"]),
  note: z.string().optional(),
});

export const createArchRequestInput = z
  .object({
    communityId: z.string().min(1),
    unitId: z.string().optional(),
    homeownerId: z.string().optional(),
    requestType: z.string().min(1).max(100),
    description: z.string().min(1),
  })
  .strict();

export const reviewArchRequestInput = z.object({
  status: z.enum(["approved", "approved_with_conditions", "denied"]),
  reviewNote: z.string().optional(),
});

export const createMeetingInput = z.object({
  communityId: z.string().min(1),
  title: z.string().min(1).max(200),
  meetingType: z.enum(["annual", "special", "board"]),
  scheduledAt: z.string().datetime(),
  location: z.string().optional(),
});

export const updateMeetingMinutesInput = z.object({
  minutesText: z.string().min(1),
  finalize: z.boolean().optional().default(false),
});

export const createMotionInput = z.object({
  text: z.string().min(1),
  movedByUserId: z.string().optional(),
  secondedByUserId: z.string().optional(),
});

export const resolveMotionInput = z.object({
  status: z.enum(["passed", "failed", "tabled"]),
});

export const castVoteInput = z.object({
  choice: z.enum(["yes", "no", "abstain"]),
  notes: z.string().optional(),
});

export const createOwnerPortalSessionInput = z.object({
  homeownerId: z.string().min(1),
  communityId: z.string().min(1),
  sendEmail: z.boolean().optional().default(false),
});

export const rosterRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().min(1),
  unitNumber: z.string().optional(),
  // Same calendar-date validation as addHomeownerInput so a bad date format in
  // an imported CSV row surfaces as a row-keyed import error, not a detached
  // failure when the API later tries to persist the row.
  moveInDate: calendarDateString.optional(),
});

export type RosterRow = z.infer<typeof rosterRowSchema>;

export const addHomeownerInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  unitNumber: z.string().optional(),
  phone: z.string().optional(),
  moveInDate: calendarDateString.optional(),
});

export type AddHomeownerInput = z.infer<typeof addHomeownerInput>;

export const homeownerImportSkipReasonSchema = z.enum([
  "duplicate-in-upload",
  "already-exists",
  "invalid",
]);

export type HomeownerImportSkipReason = z.infer<
  typeof homeownerImportSkipReasonSchema
>;

export const homeownerImportSkippedRowSchema = z.object({
  row: z.number().int(),
  email: z.string(),
  reason: homeownerImportSkipReasonSchema,
});

export type HomeownerImportSkippedRow = z.infer<
  typeof homeownerImportSkippedRowSchema
>;

export const homeownerImportResponseSchema = z.object({
  created: z.number().int().min(0),
  skipped: z.array(homeownerImportSkippedRowSchema),
});

export type HomeownerImportResponse = z.infer<
  typeof homeownerImportResponseSchema
>;
