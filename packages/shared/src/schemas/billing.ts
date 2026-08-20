import { z } from "zod";
import { TIER_VALUES } from "../billing/tiers.js";

export const TrialStatus = z.enum([
  "pending_trial",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export type TrialStatus = z.infer<typeof TrialStatus>;

export const BillingCycle = z.enum(["monthly", "annual"]);
export type BillingCycle = z.infer<typeof BillingCycle>;

export const TierSlug = z.enum(TIER_VALUES);
export type TierSlug = z.infer<typeof TierSlug>;

export const CheckoutTierSlug = z.enum(["starter", "growth", "scale"]);
export type CheckoutTierSlug = z.infer<typeof CheckoutTierSlug>;

export const checkoutRequest = z.object({
  communityId: z.string().min(1),
  tier: CheckoutTierSlug,
  cycle: BillingCycle,
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export type CheckoutRequest = z.infer<typeof checkoutRequest>;

export const startTrialRequest = z.object({
  communityId: z.string().min(1),
  tier: TierSlug.optional(),
  cycle: BillingCycle.optional(),
});

export type StartTrialRequest = z.infer<typeof startTrialRequest>;

/**
 * Shape of the billing status response from GET /billing/status.
 * Shared so both the API serializer and frontend consumer reference the same
 * contract rather than maintaining parallel type definitions.
 */
export const billingStatusResponse = z.object({
  status: TrialStatus,
  tier: TierSlug,
  cycle: BillingCycle.nullable(),
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

export type BillingStatusResponse = z.infer<typeof billingStatusResponse>;
