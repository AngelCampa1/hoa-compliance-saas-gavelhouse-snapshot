import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BaseLayout } from "../../src/emails/BaseLayout.js";

describe("BaseLayout", () => {
  it("renders commercial unsubscribe links when supplied", () => {
    const html = renderToStaticMarkup(
      <BaseLayout
        preheader="Preview copy"
        companyPostalAddress="Gavelhouse, 123 Test St, Testville, CA 94000"
        unsubscribeUrl="https://api.gavelhouse.app/unsubscribe?token=tok-1"
      >
        <p>Body copy</p>
      </BaseLayout>,
    );

    expect(html).toContain("Preview copy");
    expect(html).toContain("Body copy");
    expect(html).toContain(
      'href="https://api.gavelhouse.app/unsubscribe?token=tok-1"',
    );
    expect(html).toContain("Unsubscribe from these emails");
    expect(html).toContain(
      "Compliance-first HOA and condo management for self-managed boards.",
    );
  });
});
