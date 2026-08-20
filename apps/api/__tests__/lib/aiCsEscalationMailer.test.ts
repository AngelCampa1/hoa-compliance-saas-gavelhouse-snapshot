import { describe, it, expect } from "vitest";
import { knowledgeBase } from "@boardstack/shared";
import {
  buildEscalationNotification,
  type EscalationTicket,
} from "../../src/lib/aiCsEscalationMailer.js";

const supportEmail = knowledgeBase.marketing.founderContact.email;
const productName = knowledgeBase.marketing.product.name;

function ticket(overrides: Partial<EscalationTicket> = {}): EscalationTicket {
  return {
    userId: "user-1",
    userEmail: "treasurer@example.com",
    sessionId: "cs_42",
    reason: "billing",
    message: "I was double charged",
    contact: "treasurer@hoa.example",
    ...overrides,
  };
}

describe("buildEscalationNotification", () => {
  it("addresses the support inbox and summarizes the escalation", () => {
    const notification = buildEscalationNotification(ticket());

    expect(notification.to).toBe(supportEmail);
    expect(notification.from).toBe(`Angel Campa <${supportEmail}>`);
    expect(notification.subject).toBe(
      `New ${productName} support escalation — session cs_42`,
    );
    expect(notification.text).toContain("treasurer@example.com (user-1)");
    expect(notification.text).toContain("Session: cs_42");
    expect(notification.text).toContain("Reason: billing");
    expect(notification.text).toContain("Contact: treasurer@hoa.example");
    expect(notification.text).toContain("I was double charged");
  });

  it("renders an em dash for every absent optional field", () => {
    const notification = buildEscalationNotification(
      ticket({ reason: null, message: null, contact: null }),
    );

    expect(notification.text).toContain("Reason: —");
    expect(notification.text).toContain("Contact: —");
    expect(notification.text.trimEnd().endsWith("—")).toBe(true);
  });
});
