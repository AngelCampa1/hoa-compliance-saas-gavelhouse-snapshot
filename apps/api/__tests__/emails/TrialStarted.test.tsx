import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialStarted } from "../../src/emails/TrialStarted.js";

const baseProps = {
  recipientName: "Jane Owner",
  communityName: "Sunset HOA",
  planName: "Starter",
  amountLabel: "$20.00/month",
  trialStartedLabel: "April 1, 2026",
  trialEndsLabel: "May 1, 2026",
  ctaUrl: "https://my.gavelhouse.app/settings/billing",
  companyPostalAddress: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

describe("TrialStarted", () => {
  it("renders the heading, community, and CTA when billing is configured", () => {
    const html = renderToStaticMarkup(
      <TrialStarted {...baseProps} billingConfigured={true} />,
    );
    expect(html).toContain("Your Gavelhouse trial is live");
    expect(html).toContain("Sunset HOA");
    expect(html).toContain("April 1, 2026");
    expect(html).toContain("May 1, 2026");
    expect(html).toContain("automatically charge $20.00/month");
    expect(html).toContain('href="https://my.gavelhouse.app/settings/billing"');
    expect(html).toContain("Manage billing");
    expect(html).toContain("Gavelhouse, 123 Test St, Testville, CA 94000");
  });

  it("uses the add-payment CTA when billing is not configured", () => {
    const html = renderToStaticMarkup(
      <TrialStarted {...baseProps} billingConfigured={false} />,
    );
    expect(html).toContain("Add a payment method");
    expect(html).toContain("Add payment method");
    expect(html).not.toContain("automatically charge");
  });

  it("falls back to a generic greeting when no name is provided", () => {
    const html = renderToStaticMarkup(
      <TrialStarted {...baseProps} recipientName="" billingConfigured={true} />,
    );
    expect(html).toContain("Hi,");
    expect(html).not.toContain("Hi ,");
  });

  it("does not render an unsubscribe link (transactional)", () => {
    const html = renderToStaticMarkup(
      <TrialStarted {...baseProps} billingConfigured={true} />,
    );
    expect(html).not.toContain("Unsubscribe from these emails");
    expect(html).not.toContain("/unsubscribe?");
  });
});
