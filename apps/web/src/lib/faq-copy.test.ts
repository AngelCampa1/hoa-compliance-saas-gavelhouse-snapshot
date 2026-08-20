import { describe, expect, it } from "vitest";
import { getFaqHeading } from "./faq-copy";

describe("getFaqHeading", () => {
  it("returns an explicit heading when one is provided", () => {
    expect(getFaqHeading("Wedding planning questions")).toBe(
      "Wedding planning questions",
    );
  });

  it("falls back to a neutral heading instead of B2B copy", () => {
    expect(getFaqHeading()).toBe("Frequently asked questions");
  });
});
