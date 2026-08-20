import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialEnding } from "../../src/emails/TrialEnding.js";

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

describe("TrialEnding", () => {
  it("warns about the auto-charge date when billing is configured", () => {
    const html = renderToStaticMarkup(
      <TrialEnding {...baseProps} billingConfigured={true} />,
    );
    expect(html).toContain("Your trial ends May 1, 2026");
    expect(html).toContain("automatically charge $20.00/month");
    expect(html).toContain('href="https://my.gavelhouse.app/settings/billing"');
    expect(html).toContain("Manage billing");
  });

  it("warns about lockout when billing is not configured", () => {
    const html = renderToStaticMarkup(
      <TrialEnding {...baseProps} billingConfigured={false} />,
    );
    expect(html).toContain("lock access until you start a paid subscription");
    expect(html).toContain("Add payment method");
    expect(html).not.toContain("automatically charge");
  });

  it("does not render an unsubscribe link (transactional)", () => {
    const html = renderToStaticMarkup(
      <TrialEnding {...baseProps} billingConfigured={true} />,
    );
    expect(html).not.toContain("Unsubscribe from these emails");
  });

  it("falls back to 'Hi,' when recipientName is null", () => {
    const html = renderToStaticMarkup(
      <TrialEnding
        {...baseProps}
        recipientName={null}
        billingConfigured={true}
      />,
    );
    expect(html).toContain("Hi,");
    expect(html).not.toContain("Hi null");
  });

  it("falls back to 'Hi,' when recipientName is an empty string", () => {
    const html = renderToStaticMarkup(
      <TrialEnding {...baseProps} recipientName="" billingConfigured={true} />,
    );
    expect(html).toContain("Hi,");
  });
});
