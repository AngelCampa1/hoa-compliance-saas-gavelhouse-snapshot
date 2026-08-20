import * as React from "react";
import { render } from "@react-email/render";
import { BRAND_NAME, BRAND_NOREPLY_EMAIL } from "@boardstack/shared";
import { DuesReminder } from "../../emails/DuesReminder.js";
import { resolveCompanyPostalAddress } from "../../lib/postalAddress.js";
import type { Env } from "../../types/env.js";

interface ReminderEmailInput {
  firstName: string;
  email: string;
  amountCents: number;
  dueDate: string;
  communityName: string;
  /** Owner portal link the homeowner uses to pay. */
  portalUrl: string;
}

interface ReminderEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

type ReminderEmailEnv = Pick<Env, "COMPANY_POSTAL_ADDRESS">;

export async function buildReminderEmail(
  input: ReminderEmailInput,
  env: ReminderEmailEnv,
): Promise<ReminderEmail> {
  const companyPostalAddress = resolveCompanyPostalAddress(env);
  const amountLabel = `$${(input.amountCents / 100).toFixed(2)}`;

  const html = await render(
    React.createElement(DuesReminder, {
      firstName: input.firstName,
      communityName: input.communityName,
      amountLabel,
      dueDate: input.dueDate,
      portalUrl: input.portalUrl,
      companyPostalAddress,
    }),
  );

  const text = [
    `Hi ${input.firstName},`,
    "",
    `Your HOA assessment of ${amountLabel} was due on ${input.dueDate}. If you've already paid, please disregard this notice.`,
    "",
    `Pay your assessment: ${input.portalUrl}`,
    "",
    `— ${input.communityName} Board`,
  ].join("\n");

  // Display name on the From line tells homeowner inboxes whose mail this is;
  // the address remains a single Gavelhouse-controlled domain so DKIM/SPF align.
  const displayName = input.communityName.replace(/[<>"]/g, "").trim();
  return {
    from: `${displayName} via ${BRAND_NAME} <${BRAND_NOREPLY_EMAIL}>`,
    to: input.email,
    subject: `Payment reminder from ${input.communityName}`,
    html,
    text,
  };
}

/* v8 ignore start -- Resend transport is intentionally not exercised in CI. */
export async function sendReminderEmail(
  email: ReminderEmail,
  resendApiKey: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
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
