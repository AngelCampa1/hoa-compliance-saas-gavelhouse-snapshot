import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { knowledgeBase, type LeadMagnetSlug } from "@boardstack/shared";
import type { Env } from "../types/env.js";

export type SendLeadMagnetEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  magnetSlug: LeadMagnetSlug;
  /** Step in the lead email flow. 0 = resource delivery, 1-4 = follow-ups. */
  step: 0 | 1 | 2 | 3 | 4;
  /** Used as the idempotency key so retries do not double-send. */
  enrollmentId: string;
  /**
   * Per-recipient unsubscribe URL for follow-up emails. When present, echoed
   * into `List-Unsubscribe` headers so clients can offer one-click opt-out.
   */
  unsubscribeUrl?: string;
  env: Env;
};

/**
 * Renders a React Email template to HTML and posts it to Resend.
 *
 * The `Idempotency-Key` header is `${enrollmentId}:${step}` so Resend will
 * deduplicate retries within the same enrollment + step pair.
 *
 * Refuses to send if `env.COMPANY_POSTAL_ADDRESS` is unset or still contains a
 * known placeholder — the CAN-SPAM footer must contain a real postal address.
 */
/* v8 ignore start -- Resend mailer execution is intentionally not covered in CI. */
export async function sendLeadMagnetEmail(
  input: SendLeadMagnetEmailInput,
): Promise<void> {
  const postalAddress = input.env.COMPANY_POSTAL_ADDRESS?.trim() ?? "";
  if (
    !postalAddress ||
    /\[set\s+COMPANY_POSTAL_ADDRESS\s+in\s+production\]/i.test(postalAddress) ||
    /<real registered mailing address/i.test(postalAddress)
  ) {
    throw new Error(
      "COMPANY_POSTAL_ADDRESS not configured with a real address — refusing to send email without a CAN-SPAM compliant footer address.",
    );
  }
  if (input.step !== 0 && !input.unsubscribeUrl) {
    throw new Error(
      "unsubscribeUrl is required for follow-up lead magnet emails.",
    );
  }

  await sendLeadMagnetEmailViaResend(input);
}

async function sendLeadMagnetEmailViaResend(
  input: SendLeadMagnetEmailInput,
): Promise<void> {
  const html = await render(input.react);
  const unsubscribeHeaders =
    input.step !== 0 && input.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${input.enrollmentId}:${input.step}`,
    },
    body: JSON.stringify({
      from: `Angel Campa <${knowledgeBase.marketing.founderContact.email}>`,
      to: input.to,
      subject: input.subject,
      html,
      ...(unsubscribeHeaders ? { headers: unsubscribeHeaders } : {}),
      tags: [
        { name: "magnet", value: input.magnetSlug },
        { name: "step", value: String(input.step) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
/* v8 ignore stop */
