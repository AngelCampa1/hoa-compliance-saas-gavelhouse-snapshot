import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PublicSignupCta from "./public-signup-cta";

describe("PublicSignupCta", () => {
  it("renders the default CTA target for the current source page", () => {
    render(<PublicSignupCta sourcePage="/resources" />);

    const link = screen.getByRole("link", { name: "Start trial" });

    expect(link.getAttribute("href")).toBe("https://my.gavelhouse.app/signup");
  });

  it("prefers explicit CTA text and target overrides", () => {
    render(
      <PublicSignupCta
        sourcePage="/compare"
        ctaText="Read the guide"
        ctaTarget="/resources/guides/privacy"
      />,
    );

    const link = screen.getByRole("link", { name: "Read the guide" });

    expect(link.getAttribute("href")).toBe("/resources/guides/privacy");
  });
});
