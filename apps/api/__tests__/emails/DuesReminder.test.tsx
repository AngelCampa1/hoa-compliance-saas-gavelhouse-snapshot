import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DuesReminder } from "../../src/emails/DuesReminder.js";

const baseProps = {
  firstName: "Jane",
  communityName: "Oakwood HOA",
  amountLabel: "$250.00",
  dueDate: "2026-05-01",
  portalUrl: "https://owners.oakwood.example/portal",
  companyPostalAddress: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

describe("DuesReminder", () => {
  it("renders the homeowner-facing heading, amount, and CTA", () => {
    const html = renderToStaticMarkup(<DuesReminder {...baseProps} />);
    expect(html).toContain("Payment reminder from Oakwood HOA");
    expect(html).toContain("Hi Jane,");
    expect(html).toContain("$250.00");
    expect(html).toContain("2026-05-01");
    expect(html).toContain('href="https://owners.oakwood.example/portal"');
    expect(html).toContain("Pay your assessment");
  });

  it("uses a community-branded footer blurb instead of Gavelhouse marketing copy", () => {
    const html = renderToStaticMarkup(<DuesReminder {...baseProps} />);
    expect(html).toContain("Sent on behalf of Oakwood HOA via Gavelhouse");
    expect(html).not.toContain(
      "Compliance-first HOA and condo management for self-managed boards",
    );
  });

  it("does not render an unsubscribe link (transactional, owner-to-HOA)", () => {
    const html = renderToStaticMarkup(<DuesReminder {...baseProps} />);
    expect(html).not.toContain("Unsubscribe from these emails");
    expect(html).not.toContain("/unsubscribe?");
  });

  it("includes the postal address in the footer", () => {
    const html = renderToStaticMarkup(<DuesReminder {...baseProps} />);
    expect(html).toContain("Gavelhouse, 123 Test St, Testville, CA 94000");
  });
});
