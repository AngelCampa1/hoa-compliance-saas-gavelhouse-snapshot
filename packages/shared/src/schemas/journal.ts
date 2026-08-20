import { z } from "zod";
import { calendarDateString } from "./dateValidity.js";
import { INT32_MAX } from "../constants/system.js";

export const journalLineInput = z.object({
  accountId: z.string().min(1),
  debitCents: z.number().int().min(0).max(INT32_MAX),
  creditCents: z.number().int().min(0).max(INT32_MAX),
});
export type JournalLineInput = z.infer<typeof journalLineInput>;

export const createJournalEntryInput = z.object({
  communityId: z.string().min(1),
  entryDate: calendarDateString,
  memo: z.string().min(1).max(500),
  lines: z.array(journalLineInput).min(2),
});
export type CreateJournalEntryInput = z.infer<typeof createJournalEntryInput>;
