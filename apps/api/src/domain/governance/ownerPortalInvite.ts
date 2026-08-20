import * as React from "react";
import { render } from "@react-email/render";
import { BRAND_NAME, BRAND_NOREPLY_EMAIL } from "@boardstack/shared";
import { OwnerPortalInvite } from "../../emails/OwnerPortalInvite.js";
import { resolveCompanyPostalAddress } from "../../lib/postalAddress.js";
import type { Env } from "../../types/env.js";

interface OwnerPortalInviteEmailInput {
  firstName: string;
  email: string;
  communityName: string;
  portalUrl: string;
  expiresAt: Date;
}

interface OwnerPortalInviteEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

type OwnerPortalInviteEmailEnv = Pick<Env, "COMPANY_POSTAL_ADDRESS">;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function buildOwnerPortalInviteEmail(
  input: OwnerPortalInviteEmailInput,
  env: OwnerPortalInviteEmailEnv,
): Promise<OwnerPortalInviteEmail> {
  const companyPostalAddress = resolveCompanyPostalAddress(env);
  const expiresAtLabel = formatDate(input.expiresAt);

  const html = await render(
    React.createElement(OwnerPortalInvite, {
      firstName: input.firstName,
      communityName: input.communityName,
      portalUrl: input.portalUrl,
      expiresAtLabel,
      companyPostalAddress,
    }),
  );

  const text = [
    `Hi ${input.firstName},`,
    "",
    `Your board has created a secure ${BRAND_NAME} owner portal link for ${input.communityName}.`,
    "",
    `Open your owner portal: ${input.portalUrl}`,
    "",
    `This link expires ${expiresAtLabel}.`,
    "",
    `- ${input.communityName} Board`,
  ].join("\n");

  const displayName = input.communityName.replace(/[<>"]/g, "").trim();
  return {
    from: `${displayName} via ${BRAND_NAME} <${BRAND_NOREPLY_EMAIL}>`,
    to: input.email,
    subject: `Your ${input.communityName} owner portal link`,
    html,
    text,
  };
}

/* v8 ignore start -- Resend transport is intentionally not exercised in CI. */
export async function sendOwnerPortalInviteEmail(
  email: OwnerPortalInviteEmail,
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
