import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadMagnetDelivery } from "../../src/emails/LeadMagnetDelivery.js";
import { getMagnetConfig } from "../../src/emails/content/magnets.js";

describe("LeadMagnetDelivery", () => {
  const magnet = getMagnetConfig("reserve-fund-calculator");
  const downloadUrl =
    "https://gavelhouse.app/downloads/reserve-fund-calculator.pdf";

  const companyPostalAddress = "Gavelhouse, 123 Test St, Testville, CA 94000";
  const html = renderToStaticMarkup(
    <LeadMagnetDelivery
      magnet={magnet}
      downloadUrl={downloadUrl}
      companyPostalAddress={companyPostalAddress}
    />,
  );

  it("renders the magnet title in the email body", () => {
    expect(html).toContain(magnet.title);
  });

  it("includes the download URL in an <a href>", () => {
    expect(html).toContain(`href="${downloadUrl}"`);
  });

  it("renders the delivery body paragraphs", () => {
    // First several words of the configured body should be present
    const firstWords = magnet.deliveryBodyMarkdown.slice(0, 20);
    // bold markers are stripped in HTML
    expect(html).toContain(firstWords.replace(/\*\*/g, "").slice(0, 10));
  });

  it("does not render an unsubscribe link in the resource delivery email", () => {
    expect(html).not.toContain("/unsubscribe?token=");
    expect(html).not.toContain("Opt out");
  });

  it("renders the Gavelhouse wordmark header", () => {
    expect(html).toContain("Gavelhouse");
    expect(html).toContain("#163a5f");
    expect(html).toContain("#cb8a2e");
    expect(html).toContain("Gavelhouse logo");
    expect(html).toContain("letter-spacing:0");
    expect(html).not.toContain("letter-spacing:-");
  });

  it("includes the supplied CAN-SPAM postal address in the footer", () => {
    expect(html).toContain(companyPostalAddress);
    // Legacy placeholder must not leak back in.
    expect(html).not.toContain("PO Box TBD");
  });
});
