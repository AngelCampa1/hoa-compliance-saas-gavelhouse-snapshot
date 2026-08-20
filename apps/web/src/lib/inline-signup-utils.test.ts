import { describe, expect, it } from "vitest";
import { resolveInlineSignupKicker } from "./inline-signup-utils";

describe("resolveInlineSignupKicker", () => {
  it("omits the kicker by default", () => {
    expect(resolveInlineSignupKicker()).toBeUndefined();
  });

  it("returns a trimmed kicker when provided", () => {
    expect(resolveInlineSignupKicker("  See rollout notes")).toBe(
      "See rollout notes",
    );
  });

  it("omits blank kicker values", () => {
    expect(resolveInlineSignupKicker("")).toBeUndefined();
  });
});
