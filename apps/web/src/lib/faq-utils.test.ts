import { describe, expect, it } from "vitest";
import { resolveFaqHeading } from "./faq-utils";

describe("resolveFaqHeading", () => {
  it("uses the neutral default when no heading is provided", () => {
    expect(resolveFaqHeading()).toBe("Common questions before you try it");
  });

  it("preserves a custom heading", () => {
    expect(resolveFaqHeading("What teams usually ask")).toBe(
      "What teams usually ask",
    );
  });

  it("falls back to the neutral default for blank headings", () => {
    expect(resolveFaqHeading("")).toBe("Common questions before you try it");
  });
});
