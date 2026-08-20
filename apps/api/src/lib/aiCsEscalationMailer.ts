import { knowledgeBase } from "@boardstack/shared";
import type { Env } from "../types/env.js";

/**
 * The durable shape of an AI-CS escalation, shared by the persistence layer and
 * the team notification email. Optional fields are normalized to `null` so the
 * record and the email render the same absence consistently.
 */
export type EscalationTicket = {
  userId: string;
  userEmail: string;
  sessionId: string;
  reason: string | null;
  message: string | null;
  contact: string | null;
};

export type EscalationNotification = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

/**
 * Builds the team-facing escalation notification email. Pure and deterministic
 * so it can be asserted without touching Resend.
 */
export function buildEscalationNotification(
  ticket: EscalationTicket,
): EscalationNotification {
  const productName = knowledgeBase.marketing.product.name;
  const supportEmail = knowledgeBase.marketing.founderContact.email;
  const lines = [
    `A ${productName} user escalated an AI support conversation.`,
    "",
    `User: ${ticket.userEmail} (${ticket.userId})`,
    `Session: ${ticket.sessionId}`,
    `Reason: ${ticket.reason ?? "—"}`,
    `Contact: ${ticket.contact ?? "—"}`,
    "",
    "Message:",
    ticket.message ?? "—",
  ];
  return {
    from: `Angel Campa <${supportEmail}>`,
    to: supportEmail,
    subject: `New ${productName} support escalation — session ${ticket.sessionId}`,
    text: lines.join("\n"),
  };
}

/**
 * Posts the escalation notification to Resend. Network execution is excluded
 * from coverage (mirrors the lead-magnet mailer); callers treat failures as
 * best-effort and never let them block the escalation forward.
 */
/* v8 ignore start -- Resend mailer execution is intentionally not covered in CI. */
export async function sendEscalationNotification(
  env: Env,
  ticket: EscalationTicket,
): Promise<void> {
  const notification = buildEscalationNotification(ticket);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `ai-cs-escalation:${ticket.sessionId}`,
    },
    body: JSON.stringify({
      from: notification.from,
      to: notification.to,
      subject: notification.subject,
      text: notification.text,
      tags: [{ name: "kind", value: "ai-cs-escalation" }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
/* v8 ignore stop */
