import * as React from "react";
import { render } from "@react-email/render";
import { knowledgeBase } from "@boardstack/shared";
import { SignupConfirmation } from "../../emails/SignupConfirmation.js";
import { resolveCompanyPostalAddress } from "../../lib/postalAddress.js";
import type { Env } from "../../types/env.js";

interface SignupConfirmationInput {
  email: string;
  recipientName?: string | null;
  verificationUrl: string;
}

interface SignupEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

type SignupEmailEnv = Pick<Env, "COMPANY_POSTAL_ADDRESS">;

function greeting(name?: string | null): string {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi,";
}

export async function buildSignupConfirmationEmail(
  input: SignupConfirmationInput,
  env: SignupEmailEnv,
): Promise<SignupEmail> {
  const companyPostalAddress = resolveCompanyPostalAddress(env);
  const html = await render(
    React.createElement(SignupConfirmation, {
      recipientName: input.recipientName,
      verificationUrl: input.verificationUrl,
      companyPostalAddress,
    }),
  );
  const text = [
    greeting(input.recipientName),
    "",
    "Welcome to Gavelhouse. Please confirm this email address so account notices, trial updates, and board workflow reminders reach the right inbox.",
    "",
    `Confirm your email: ${input.verificationUrl}`,
    "",
    "You can keep using Gavelhouse while this is pending.",
    "",
    "Gavelhouse",
  ].join("\n");

  return {
    to: input.email,
    subject: "Confirm your Gavelhouse email",
    html,
    text,
  };
}

/* v8 ignore start -- Resend transport is intentionally not exercised in CI. */
export async function sendSignupEmail(
  email: SignupEmail,
  resendApiKey: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Angel Campa <${knowledgeBase.marketing.founderContact.email}>`,
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
