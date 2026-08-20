import * as React from "react";
import { render } from "@react-email/render";
import { TrialStarted } from "../../emails/TrialStarted.js";
import { TrialEnding } from "../../emails/TrialEnding.js";
import { resolveCompanyPostalAddress } from "../../lib/postalAddress.js";
import type { Env } from "../../types/env.js";
import {
  BRAND_NAME,
  BRAND_TRANSACTIONAL_SENDER,
  PUBLIC_APP_URL,
} from "@boardstack/shared";

interface TrialEmailInput {
  email: string;
  recipientName?: string | null;
  communityName: string;
  planName: string;
  amountLabel: string;
  trialStartedAt: Date;
  trialEndsAt: Date;
  billingConfigured: boolean;
}

interface TrialEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

type TrialEmailEnv = Pick<Env, "APP_URL" | "COMPANY_POSTAL_ADDRESS">;

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function greeting(name?: string | null): string {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi,";
}

function billingCtaUrl(env: TrialEmailEnv): string {
  const base = env.APP_URL?.trim() || PUBLIC_APP_URL;
  return `${base.replace(/\/+$/, "")}/settings/billing`;
}

export async function buildTrialStartedEmail(
  input: TrialEmailInput,
  env: TrialEmailEnv,
): Promise<TrialEmail> {
  const companyPostalAddress = resolveCompanyPostalAddress(env);
  const trialStartedLabel = formatDate(input.trialStartedAt);
  const trialEndsLabel = formatDate(input.trialEndsAt);
  const ctaUrl = billingCtaUrl(env);

  const html = await render(
    React.createElement(TrialStarted, {
      recipientName: input.recipientName,
      communityName: input.communityName,
      planName: input.planName,
      amountLabel: input.amountLabel,
      trialStartedLabel,
      trialEndsLabel,
      billingConfigured: input.billingConfigured,
      ctaUrl,
      companyPostalAddress,
    }),
  );

  const billingLine = input.billingConfigured
    ? `Your ${input.planName} plan begins billing on ${trialEndsLabel} — we'll automatically charge ${input.amountLabel} to the card on file unless you cancel before then.`
    : `Your ${input.planName} trial ends on ${trialEndsLabel}. Add a payment method before then to keep access without interruption.`;
  const text = [
    greeting(input.recipientName),
    "",
    `Your free trial for ${input.communityName} started on ${trialStartedLabel} and runs through ${trialEndsLabel}.`,
    billingLine,
    "",
    `Manage billing: ${ctaUrl}`,
    "",
    BRAND_NAME,
  ].join("\n");

  return {
    to: input.email,
    subject: `Your ${BRAND_NAME} trial is live for ${input.communityName}`,
    html,
    text,
  };
}

export async function buildTrialEndingReminderEmail(
  input: TrialEmailInput,
  env: TrialEmailEnv,
): Promise<TrialEmail> {
  const companyPostalAddress = resolveCompanyPostalAddress(env);
  const trialStartedLabel = formatDate(input.trialStartedAt);
  const trialEndsLabel = formatDate(input.trialEndsAt);
  const ctaUrl = billingCtaUrl(env);

  const html = await render(
    React.createElement(TrialEnding, {
      recipientName: input.recipientName,
      communityName: input.communityName,
      planName: input.planName,
      amountLabel: input.amountLabel,
      trialStartedLabel,
      trialEndsLabel,
      billingConfigured: input.billingConfigured,
      ctaUrl,
      companyPostalAddress,
    }),
  );

  const actionLine = input.billingConfigured
    ? `On ${trialEndsLabel}, we will automatically charge ${input.amountLabel} for your ${input.planName} plan unless you cancel before then.`
    : `If you do not add billing by ${trialEndsLabel}, ${BRAND_NAME} will lock access until you start a paid subscription.`;
  const text = [
    greeting(input.recipientName),
    "",
    `Reminder: your free trial for ${input.communityName} started on ${trialStartedLabel} and ends on ${trialEndsLabel}.`,
    actionLine,
    "",
    `Manage billing: ${ctaUrl}`,
    "",
    BRAND_NAME,
  ].join("\n");

  return {
    to: input.email,
    subject: `Your ${BRAND_NAME} trial ends on ${trialEndsLabel}`,
    html,
    text,
  };
}

/* v8 ignore start -- Resend transport is intentionally not exercised in CI. */
export async function sendTrialEmail(
  email: TrialEmail,
  resendApiKey: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: BRAND_TRANSACTIONAL_SENDER,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
/* v8 ignore stop */
