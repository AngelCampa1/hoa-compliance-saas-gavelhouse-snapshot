import { z } from "zod";

export const LEAD_MAGNET_SLUGS = [
  "reserve-fund-calculator",
  "hoa-annual-meeting-planner",
  "hoa-software-evaluation-scorecard",
  "hoa-board-transition-checklist",
  "hoa-budget-template",
  "reserve-compliance-checklist",
  "50-state-reserve-fund-requirements",
  "hoa-board-meeting-agenda-template",
  "reserve-study-rfp-template",
  "hoa-fiduciary-duty-checklist",
  "hoa-collections-policy-template",
  "hoa-cybersecurity-checklist",
  "hoa-newsletter-template",
  "hoa-budget-checklist",
  "hoa-board-onboarding-kit",
  "hoa-reserve-fund-calculator",
  "hoa-ccr-enforcement-checklist",
] as const;

export type LeadMagnetSlug = (typeof LEAD_MAGNET_SLUGS)[number];

export const LeadMagnetSlugSchema = z.enum(LEAD_MAGNET_SLUGS);

/**
 * Honeypot field. Real users never see or fill this; a non-empty value is a
 * strong bot signal. Bounded so a hostile client cannot send an unbounded
 * payload. The server treats any non-empty value as a silent reject.
 */
const HoneypotSchema = z.string().max(256).optional();

/**
 * Cloudflare Turnstile token produced by the widget on the marketing form.
 * Verified server-side before any DB write or email send. Optional in the
 * schema (older/no-JS clients omit it); the server decides whether a missing
 * token is acceptable based on environment (fail-closed in production).
 */
const TurnstileTokenSchema = z.string().max(2048).optional();

export const SubscribeRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
  magnetSlug: LeadMagnetSlugSchema,
  // Accept either a full URL (new lead magnet pages send canonical URL) or a
  // slug/path (legacy call sites like the exit-intent popup send a short
  // identifier). Bounded at 512 chars to avoid accidental abuse.
  sourcePage: z.string().max(512).optional(),
  posthogDistinctId: z.string().optional(),
  companyWebsite: HoneypotSchema,
  turnstileToken: TurnstileTokenSchema,
});
export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

export const WaitlistSubscribeRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
  sourcePage: z.string().max(512).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  referredBy: z.string().max(200).optional(),
  posthogDistinctId: z.string().optional(),
  companyWebsite: HoneypotSchema,
  turnstileToken: TurnstileTokenSchema,
});
export type WaitlistSubscribeRequest = z.infer<
  typeof WaitlistSubscribeRequestSchema
>;

export const WaitlistSurveyAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(100),
  answer: z.string().trim().min(1).max(500),
});

export const WaitlistSurveyRequestSchema = z.object({
  surveyToken: z.string().uuid(),
  answers: z.array(WaitlistSurveyAnswerSchema).min(1).max(20),
});
export type WaitlistSurveyRequest = z.infer<typeof WaitlistSurveyRequestSchema>;

export const SubscribeResponseSchema = z.object({
  downloadUrl: z.string().url(),
  alreadySubscribed: z.boolean(),
});
export type SubscribeResponse = z.infer<typeof SubscribeResponseSchema>;
